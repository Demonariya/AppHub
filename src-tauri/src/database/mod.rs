use crate::errors::AppHubError;
use crate::models::{
    CatalogCacheStats, CatalogSourceStatus, CatalogSyncRunRecord, CollectionRecord,
    HistoryRecord, IconCacheRecord, SourceSyncOutcome, WinGetPackage, WinGetShowDetails,
};
use rusqlite::{params, Connection};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, Default)]
pub struct SourceReconciliationCounts {
    pub inserted: usize,
    pub updated: usize,
    pub unchanged: usize,
    pub marked_unavailable: usize,
}

pub struct DatabaseManager {
    conn: Mutex<Connection>,
    db_path: Option<PathBuf>,
}

impl DatabaseManager {
    pub fn new(path: &Path) -> Result<Self, AppHubError> {
        let conn = Connection::open(path)?;
        let db = DatabaseManager {
            conn: Mutex::new(conn),
            db_path: Some(path.to_path_buf()),
        };
        db.migrate()?;
        Ok(db)
    }

    pub fn in_memory() -> Result<Self, AppHubError> {
        let conn = Connection::open_in_memory()?;
        let db = DatabaseManager {
            conn: Mutex::new(conn),
            db_path: None,
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS favorites (
                package_id TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS installation_history (
                id TEXT PRIMARY KEY,
                package_id TEXT NOT NULL,
                package_name TEXT NOT NULL,
                action TEXT NOT NULL,
                version TEXT NOT NULL,
                status TEXT NOT NULL,
                error_message TEXT,
                exit_code INTEGER,
                start_time INTEGER NOT NULL,
                end_time INTEGER
            );

            CREATE TABLE IF NOT EXISTS collections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                icon_name TEXT,
                package_ids TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_history_pkg ON installation_history(package_id);
            CREATE INDEX IF NOT EXISTS idx_history_time ON installation_history(start_time DESC);
            "#,
        )?;

        // Migration v2: add exit_code column if upgrading from earlier schema
        let mut stmt = conn.prepare("PRAGMA table_info(installation_history)")?;
        let cols: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(Result::ok)
            .collect();
        drop(stmt);

        if !cols.iter().any(|c| c == "exit_code") {
            conn.execute(
                "ALTER TABLE installation_history ADD COLUMN exit_code INTEGER",
                [],
            )?;
        }

        // Migration v3: Real WinGet catalog persistence, source status tracking, and sync run logs
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS catalog_packages (
                package_id TEXT NOT NULL,
                source TEXT NOT NULL,
                name TEXT NOT NULL,
                publisher TEXT,
                author TEXT,
                version TEXT NOT NULL,
                latest_version TEXT NOT NULL,
                description TEXT,
                category TEXT,
                tags_json TEXT NOT NULL DEFAULT '[]',
                architectures_json TEXT NOT NULL DEFAULT '[]',
                license TEXT,
                license_url TEXT,
                homepage TEXT,
                publisher_url TEXT,
                release_date TEXT,
                release_notes TEXT,
                installer_type TEXT,
                installer_url TEXT,
                installer_sha256 TEXT,
                download_size_bytes INTEGER,
                installed_size_bytes INTEGER,
                verified INTEGER NOT NULL DEFAULT 0,
                metadata_status TEXT NOT NULL DEFAULT 'summary',
                is_available INTEGER NOT NULL DEFAULT 1,
                last_observed_at INTEGER NOT NULL,
                last_metadata_refresh_at INTEGER,
                PRIMARY KEY (package_id, source)
            );

            CREATE INDEX IF NOT EXISTS idx_catalog_pkg_name ON catalog_packages(name COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_catalog_pkg_source ON catalog_packages(source);
            CREATE INDEX IF NOT EXISTS idx_catalog_pkg_category ON catalog_packages(category);
            CREATE INDEX IF NOT EXISTS idx_catalog_pkg_available ON catalog_packages(is_available);
            CREATE INDEX IF NOT EXISTS idx_catalog_pkg_observed ON catalog_packages(last_observed_at DESC);

            CREATE TABLE IF NOT EXISTS catalog_sources (
                name TEXT PRIMARY KEY,
                argument TEXT NOT NULL,
                source_type TEXT NOT NULL,
                is_official INTEGER NOT NULL DEFAULT 0,
                is_enabled INTEGER NOT NULL DEFAULT 1,
                last_sync_at INTEGER,
                last_status TEXT NOT NULL DEFAULT 'never',
                last_error TEXT,
                package_count INTEGER NOT NULL DEFAULT 0,
                is_complete INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS catalog_sync_runs (
                run_id TEXT PRIMARY KEY,
                started_at INTEGER NOT NULL,
                completed_at INTEGER,
                duration_ms INTEGER,
                status TEXT NOT NULL,
                total_discovered INTEGER NOT NULL DEFAULT 0,
                newly_discovered INTEGER NOT NULL DEFAULT 0,
                updated_records INTEGER NOT NULL DEFAULT 0,
                unchanged_records INTEGER NOT NULL DEFAULT 0,
                unavailable_records INTEGER NOT NULL DEFAULT 0,
                is_complete INTEGER NOT NULL DEFAULT 0,
                is_partial INTEGER NOT NULL DEFAULT 0,
                cancelled INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                outcomes_json TEXT NOT NULL DEFAULT '[]'
            );

            CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON catalog_sync_runs(started_at DESC);
            "#,
        )?;

        let now = chrono::Utc::now().timestamp_millis();

        // Migration v4: operation lifecycle timestamps + native verified icon cache
        if !cols.iter().any(|c| c == "queued_at") {
            conn.execute("ALTER TABLE installation_history ADD COLUMN queued_at INTEGER", [])?;
        }
        if !cols.iter().any(|c| c == "started_at") {
            conn.execute("ALTER TABLE installation_history ADD COLUMN started_at INTEGER", [])?;
        }
        if !cols.iter().any(|c| c == "ended_at") {
            conn.execute("ALTER TABLE installation_history ADD COLUMN ended_at INTEGER", [])?;
        }

        conn.execute_batch(
            r#"
            UPDATE installation_history
            SET queued_at = COALESCE(queued_at, start_time),
                ended_at = COALESCE(ended_at, end_time)
            WHERE queued_at IS NULL OR (end_time IS NOT NULL AND ended_at IS NULL);

            CREATE TABLE IF NOT EXISTS icon_cache (
                cache_key TEXT PRIMARY KEY,
                package_id TEXT NOT NULL,
                source TEXT NOT NULL,
                source_type TEXT NOT NULL,
                resolved_url TEXT,
                local_path TEXT,
                mime_type TEXT,
                sha256 TEXT,
                width INTEGER,
                height INTEGER,
                status TEXT NOT NULL,
                error_message TEXT,
                fetched_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                verified INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_icon_cache_pkg ON icon_cache(package_id, source);
            CREATE INDEX IF NOT EXISTS idx_icon_cache_expires ON icon_cache(expires_at);
            "#,
        )?;

        // Migration v5: source-aware installation history & composite-keyed favorites (preserving existing rows)
        if !cols.iter().any(|c| c == "source") {
            conn.execute("ALTER TABLE installation_history ADD COLUMN source TEXT", [])?;
        }

        let v5_applied: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = 5)",
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(0)
            != 0;

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS favorites_v5 (
                fav_key TEXT PRIMARY KEY,
                package_id TEXT NOT NULL,
                source TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_favorites_v5_pkg ON favorites_v5(package_id);
            "#,
        )?;

        if !v5_applied {
            conn.execute_batch(
                r#"
                INSERT OR IGNORE INTO favorites_v5 (fav_key, package_id, source, created_at)
                SELECT LOWER(package_id), package_id, NULL, created_at FROM favorites;
                "#,
            )?;
        }

        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?1)",
            params![now],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, ?1)",
            params![now],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (3, ?1)",
            params![now],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (4, ?1)",
            params![now],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (5, ?1)",
            params![now],
        )?;

        Ok(())
    }

    /// Transitions any tasks left in an active/queued state from a previous session to 'failed'
    pub fn mark_interrupted_history_failed(&self) -> Result<usize, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        let updated = conn.execute(
            "UPDATE installation_history
             SET status = 'failed',
                 error_message = COALESCE(error_message, 'Operation interrupted before completion (application exited)'),
                 end_time = COALESCE(end_time, ?1),
                 ended_at = COALESCE(ended_at, ?1)
             WHERE status IN ('queued', 'preparing', 'downloading', 'verifying', 'installing')",
            params![now],
        )?;
        Ok(updated)
    }

    /// Marks any unfinished catalog sync runs from an unexpected exit as interrupted/cancelled
    pub fn mark_interrupted_sync_runs_cancelled(&self) -> Result<usize, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        let updated = conn.execute(
            "UPDATE catalog_sync_runs
             SET status = 'interrupted',
                 cancelled = 1,
                 completed_at = COALESCE(completed_at, ?1),
                 error = COALESCE(error, 'Catalog synchronization interrupted before completion (application exited)')
             WHERE status IN ('running', 'in_progress')",
            params![now],
        )?;
        Ok(updated)
    }

    // --- Catalog Synchronization & Querying ---

    /// Reconciles discovered WinGet records for a single source inside a single SQLite transaction.
    /// Preserves enriched metadata on existing records and ONLY marks missing records unavailable when `is_complete_scan == true`.
    pub fn reconcile_source_catalog(
        &self,
        source_name: &str,
        records: &[WinGetPackage],
        is_complete_scan: bool,
        observed_at: i64,
    ) -> Result<SourceReconciliationCounts, AppHubError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        struct ExistingRow {
            package_id: String,
            source: String,
            name: String,
            version: String,
            latest_version: String,
            is_available: bool,
        }

        let mut existing_map: HashMap<String, ExistingRow> = HashMap::new();
        {
            let mut stmt = tx.prepare(
                "SELECT package_id, source, name, version, latest_version, is_available
                 FROM catalog_packages
                 WHERE LOWER(source) = LOWER(?1)",
            )?;
            let rows = stmt.query_map(params![source_name], |row| {
                Ok(ExistingRow {
                    package_id: row.get(0)?,
                    source: row.get(1)?,
                    name: row.get(2)?,
                    version: row.get(3)?,
                    latest_version: row.get(4)?,
                    is_available: row.get::<_, i64>(5)? != 0,
                })
            })?;
            for r in rows {
                let row = r?;
                existing_map.insert(row.package_id.to_lowercase(), row);
            }
        }

        let mut counts = SourceReconciliationCounts::default();
        let mut seen_lower_ids: HashSet<String> = HashSet::with_capacity(records.len());

        {
            let mut insert_stmt = tx.prepare(
                "INSERT INTO catalog_packages (
                    package_id, source, name, publisher, author, version, latest_version,
                    description, category, tags_json, architectures_json, license, license_url,
                    homepage, publisher_url, release_date, release_notes, installer_type,
                    installer_url, installer_sha256, download_size_bytes, installed_size_bytes,
                    verified, metadata_status, is_available, last_observed_at, last_metadata_refresh_at
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                    ?8, ?9, ?10, ?11, ?12, ?13,
                    ?14, ?15, ?16, ?17, ?18,
                    ?19, ?20, ?21, ?22,
                    ?23, ?24, 1, ?25, ?26
                 )",
            )?;

            let mut update_stmt = tx.prepare(
                "UPDATE catalog_packages
                 SET name = ?1,
                     version = ?2,
                     latest_version = ?3,
                     verified = ?4,
                     is_available = 1,
                     last_observed_at = ?5
                 WHERE package_id = ?6 AND source = ?7",
            )?;

            let mut touch_stmt = tx.prepare(
                "UPDATE catalog_packages
                 SET is_available = 1,
                     last_observed_at = ?1
                 WHERE package_id = ?2 AND source = ?3",
            )?;

            for pkg in records {
                let id_lower = pkg.id.to_lowercase();
                if !seen_lower_ids.insert(id_lower.clone()) {
                    // Duplicate row inside the same source output; keep first
                    continue;
                }

                let record_source = if pkg.source.trim().is_empty() {
                    source_name.to_string()
                } else {
                    pkg.source.clone()
                };

                if let Some(existing) = existing_map.get(&id_lower) {
                    let changed = existing.name != pkg.name
                        || existing.version != pkg.version
                        || existing.latest_version != pkg.latest_version
                        || !existing.is_available;

                    if changed {
                        update_stmt.execute(params![
                            pkg.name,
                            pkg.version,
                            pkg.latest_version,
                            if pkg.verified { 1 } else { 0 },
                            observed_at,
                            existing.package_id,
                            existing.source,
                        ])?;
                        counts.updated += 1;
                    } else {
                        touch_stmt.execute(params![
                            observed_at,
                            existing.package_id,
                            existing.source,
                        ])?;
                        counts.unchanged += 1;
                    }
                } else {
                    let tags_json =
                        serde_json::to_string(&pkg.tags).unwrap_or_else(|_| "[]".to_string());
                    let arch_json = serde_json::to_string(&pkg.architectures)
                        .unwrap_or_else(|_| "[]".to_string());
                    insert_stmt.execute(params![
                        pkg.id,
                        record_source,
                        pkg.name,
                        pkg.publisher,
                        pkg.author,
                        pkg.version,
                        pkg.latest_version,
                        pkg.description,
                        pkg.category,
                        tags_json,
                        arch_json,
                        pkg.license,
                        pkg.license_url,
                        pkg.homepage,
                        pkg.publisher_url,
                        pkg.release_date,
                        pkg.release_notes,
                        pkg.installer_type,
                        pkg.installer_url,
                        pkg.installer_sha256,
                        pkg.download_size_bytes.map(|v| v as i64),
                        pkg.installed_size_bytes.map(|v| v as i64),
                        if pkg.verified { 1 } else { 0 },
                        pkg.metadata_status,
                        observed_at,
                        pkg.last_metadata_refresh_at,
                    ])?;
                    counts.inserted += 1;
                }
            }
        }

        if is_complete_scan {
            let mut unavail_stmt = tx.prepare(
                "UPDATE catalog_packages
                 SET is_available = 0
                 WHERE package_id = ?1 AND source = ?2",
            )?;
            for (lower_id, existing) in &existing_map {
                if existing.is_available && !seen_lower_ids.contains(lower_id) {
                    unavail_stmt.execute(params![existing.package_id, existing.source])?;
                    counts.marked_unavailable += 1;
                }
            }
        }

        tx.commit()?;
        Ok(counts)
    }

    /// Updates enriched metadata returned by `winget show --id <id>` without wiping observed availability.
    pub fn update_package_metadata_from_show(
        &self,
        package_id: &str,
        source: Option<&str>,
        details: &WinGetShowDetails,
        inferred_category: Option<&str>,
    ) -> Result<usize, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        let tags_json = serde_json::to_string(&details.tags).unwrap_or_else(|_| "[]".to_string());
        let arch_json =
            serde_json::to_string(&details.architectures).unwrap_or_else(|_| "[]".to_string());

        let rows_affected = if let Some(src) = source.filter(|s| !s.trim().is_empty()) {
            conn.execute(
                "UPDATE catalog_packages
                 SET name = COALESCE(NULLIF(?1, ''), name),
                     publisher = COALESCE(?2, publisher),
                     author = COALESCE(?3, author),
                     version = CASE WHEN ?4 != '' AND ?4 != 'Unknown' THEN ?4 ELSE version END,
                     latest_version = CASE WHEN ?4 != '' AND ?4 != 'Unknown' THEN ?4 ELSE latest_version END,
                     description = COALESCE(?5, description),
                     category = COALESCE(?6, category),
                     tags_json = CASE WHEN ?7 != '[]' THEN ?7 ELSE tags_json END,
                     architectures_json = CASE WHEN ?8 != '[]' THEN ?8 ELSE architectures_json END,
                     license = COALESCE(?9, license),
                     license_url = COALESCE(?10, license_url),
                     homepage = COALESCE(?11, homepage),
                     publisher_url = COALESCE(?12, publisher_url),
                     release_date = COALESCE(?13, release_date),
                     release_notes = COALESCE(?14, release_notes),
                     installer_type = COALESCE(?15, installer_type),
                     installer_url = COALESCE(?16, installer_url),
                     installer_sha256 = COALESCE(?17, installer_sha256),
                     download_size_bytes = COALESCE(?18, download_size_bytes),
                     metadata_status = 'enriched',
                     last_metadata_refresh_at = ?19
                 WHERE LOWER(package_id) = LOWER(?20) AND LOWER(source) = LOWER(?21)",
                params![
                    details.name,
                    details.publisher,
                    details.author,
                    details.version,
                    details.description,
                    inferred_category,
                    tags_json,
                    arch_json,
                    details.license,
                    details.license_url,
                    details.homepage,
                    details.publisher_url,
                    details.release_date,
                    details.release_notes,
                    details.installer_type,
                    details.installer_url,
                    details.installer_sha256,
                    details.download_size_bytes.map(|v| v as i64),
                    now,
                    package_id,
                    src,
                ],
            )?
        } else {
            conn.execute(
                "UPDATE catalog_packages
                 SET name = COALESCE(NULLIF(?1, ''), name),
                     publisher = COALESCE(?2, publisher),
                     author = COALESCE(?3, author),
                     version = CASE WHEN ?4 != '' AND ?4 != 'Unknown' THEN ?4 ELSE version END,
                     latest_version = CASE WHEN ?4 != '' AND ?4 != 'Unknown' THEN ?4 ELSE latest_version END,
                     description = COALESCE(?5, description),
                     category = COALESCE(?6, category),
                     tags_json = CASE WHEN ?7 != '[]' THEN ?7 ELSE tags_json END,
                     architectures_json = CASE WHEN ?8 != '[]' THEN ?8 ELSE architectures_json END,
                     license = COALESCE(?9, license),
                     license_url = COALESCE(?10, license_url),
                     homepage = COALESCE(?11, homepage),
                     publisher_url = COALESCE(?12, publisher_url),
                     release_date = COALESCE(?13, release_date),
                     release_notes = COALESCE(?14, release_notes),
                     installer_type = COALESCE(?15, installer_type),
                     installer_url = COALESCE(?16, installer_url),
                     installer_sha256 = COALESCE(?17, installer_sha256),
                     download_size_bytes = COALESCE(?18, download_size_bytes),
                     metadata_status = 'enriched',
                     last_metadata_refresh_at = ?19
                 WHERE LOWER(package_id) = LOWER(?20)",
                params![
                    details.name,
                    details.publisher,
                    details.author,
                    details.version,
                    details.description,
                    inferred_category,
                    tags_json,
                    arch_json,
                    details.license,
                    details.license_url,
                    details.homepage,
                    details.publisher_url,
                    details.release_date,
                    details.release_notes,
                    details.installer_type,
                    details.installer_url,
                    details.installer_sha256,
                    details.download_size_bytes.map(|v| v as i64),
                    now,
                    package_id,
                ],
            )?
        };

        Ok(rows_affected)
    }

    pub fn get_catalog_packages(&self, include_unavailable: bool) -> Result<Vec<WinGetPackage>, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let sql = if include_unavailable {
            "SELECT package_id, name, publisher, author, version, latest_version,
                    description, category, source, tags_json, architectures_json,
                    license, license_url, homepage, publisher_url, release_date, release_notes,
                    installer_type, installer_url, installer_sha256,
                    download_size_bytes, installed_size_bytes, verified,
                    metadata_status, is_available, last_observed_at, last_metadata_refresh_at
             FROM catalog_packages
             ORDER BY name COLLATE NOCASE ASC"
        } else {
            "SELECT package_id, name, publisher, author, version, latest_version,
                    description, category, source, tags_json, architectures_json,
                    license, license_url, homepage, publisher_url, release_date, release_notes,
                    installer_type, installer_url, installer_sha256,
                    download_size_bytes, installed_size_bytes, verified,
                    metadata_status, is_available, last_observed_at, last_metadata_refresh_at
             FROM catalog_packages
             WHERE is_available = 1
             ORDER BY name COLLATE NOCASE ASC"
        };

        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map([], |row| {
            let tags_str: String = row.get(9)?;
            let arch_str: String = row.get(10)?;
            let dl_size: Option<i64> = row.get(20)?;
            let inst_size: Option<i64> = row.get(21)?;
            Ok(WinGetPackage {
                id: row.get(0)?,
                name: row.get(1)?,
                publisher: row.get(2)?,
                author: row.get(3)?,
                version: row.get(4)?,
                latest_version: row.get(5)?,
                description: row.get(6)?,
                category: row.get(7)?,
                source: row.get(8)?,
                tags: serde_json::from_str(&tags_str).unwrap_or_default(),
                architectures: serde_json::from_str(&arch_str).unwrap_or_default(),
                license: row.get(11)?,
                license_url: row.get(12)?,
                homepage: row.get(13)?,
                publisher_url: row.get(14)?,
                release_date: row.get(15)?,
                release_notes: row.get(16)?,
                installer_type: row.get(17)?,
                installer_url: row.get(18)?,
                installer_sha256: row.get(19)?,
                download_size_bytes: dl_size.and_then(|v| if v > 0 { Some(v as u64) } else { None }),
                installed_size_bytes: inst_size.and_then(|v| if v > 0 { Some(v as u64) } else { None }),
                verified: row.get::<_, i64>(22)? != 0,
                metadata_status: row.get(23)?,
                is_available: row.get::<_, i64>(24)? != 0,
                last_observed_at: row.get(25)?,
                last_metadata_refresh_at: row.get(26)?,
                is_installed: false,
                installed_version: None,
                is_pinned: false,
            })
        })?;

        let mut packages = Vec::new();
        for r in rows {
            packages.push(r?);
        }
        Ok(packages)
    }

    pub fn save_catalog_source_status(&self, status: &CatalogSourceStatus) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO catalog_sources (
                name, argument, source_type, is_official, is_enabled,
                last_sync_at, last_status, last_error, package_count, is_complete
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                status.name,
                status.argument,
                status.source_type,
                if status.is_official { 1 } else { 0 },
                if status.is_enabled { 1 } else { 0 },
                status.last_sync_at,
                status.last_status,
                status.last_error,
                status.package_count as i64,
                if status.is_complete { 1 } else { 0 },
            ],
        )?;
        Ok(())
    }

    pub fn get_catalog_sources_status(&self) -> Result<Vec<CatalogSourceStatus>, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT name, argument, source_type, is_official, is_enabled,
                    last_sync_at, last_status, last_error, package_count, is_complete
             FROM catalog_sources
             ORDER BY is_official DESC, name ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(CatalogSourceStatus {
                name: row.get(0)?,
                argument: row.get(1)?,
                source_type: row.get(2)?,
                is_official: row.get::<_, i64>(3)? != 0,
                is_enabled: row.get::<_, i64>(4)? != 0,
                last_sync_at: row.get(5)?,
                last_status: row.get(6)?,
                last_error: row.get(7)?,
                package_count: row.get::<_, i64>(8)?.max(0) as usize,
                is_complete: row.get::<_, i64>(9)? != 0,
            })
        })?;
        let mut res = Vec::new();
        for r in rows {
            res.push(r?);
        }
        Ok(res)
    }

    pub fn save_sync_run(&self, run: &CatalogSyncRunRecord) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        let outcomes_json = serde_json::to_string(&run.outcomes).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "INSERT OR REPLACE INTO catalog_sync_runs (
                run_id, started_at, completed_at, duration_ms, status,
                total_discovered, newly_discovered, updated_records, unchanged_records,
                unavailable_records, is_complete, is_partial, cancelled, error, outcomes_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                run.run_id,
                run.started_at,
                run.completed_at,
                run.duration_ms,
                run.status,
                run.total_discovered as i64,
                run.newly_discovered as i64,
                run.updated_records as i64,
                run.unchanged_records as i64,
                run.unavailable_records as i64,
                if run.is_complete { 1 } else { 0 },
                if run.is_partial { 1 } else { 0 },
                if run.cancelled { 1 } else { 0 },
                run.error,
                outcomes_json,
            ],
        )?;
        Ok(())
    }

    pub fn get_sync_history(&self, limit: usize) -> Result<Vec<CatalogSyncRunRecord>, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT run_id, started_at, completed_at, duration_ms, status,
                    total_discovered, newly_discovered, updated_records, unchanged_records,
                    unavailable_records, is_complete, is_partial, cancelled, error, outcomes_json
             FROM catalog_sync_runs
             ORDER BY started_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit as i64], |row| {
            let outcomes_str: String = row.get(14)?;
            let outcomes: Vec<SourceSyncOutcome> =
                serde_json::from_str(&outcomes_str).unwrap_or_default();
            Ok(CatalogSyncRunRecord {
                run_id: row.get(0)?,
                started_at: row.get(1)?,
                completed_at: row.get(2)?,
                duration_ms: row.get(3)?,
                status: row.get(4)?,
                total_discovered: row.get::<_, i64>(5)?.max(0) as usize,
                newly_discovered: row.get::<_, i64>(6)?.max(0) as usize,
                updated_records: row.get::<_, i64>(7)?.max(0) as usize,
                unchanged_records: row.get::<_, i64>(8)?.max(0) as usize,
                unavailable_records: row.get::<_, i64>(9)?.max(0) as usize,
                is_complete: row.get::<_, i64>(10)? != 0,
                is_partial: row.get::<_, i64>(11)? != 0,
                cancelled: row.get::<_, i64>(12)? != 0,
                error: row.get(13)?,
                outcomes,
            })
        })?;
        let mut res = Vec::new();
        for r in rows {
            res.push(r?);
        }
        Ok(res)
    }

    pub fn get_catalog_stats(&self) -> Result<CatalogCacheStats, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let total_packages: usize = conn
            .query_row("SELECT COUNT(*) FROM catalog_packages", [], |r| r.get::<_, i64>(0))
            .unwrap_or(0)
            .max(0) as usize;
        let available_packages: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM catalog_packages WHERE is_available = 1",
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(0)
            .max(0) as usize;
        let enriched_packages: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM catalog_packages WHERE is_available = 1 AND metadata_status = 'enriched'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(0)
            .max(0) as usize;

        let last_sync_at: Option<i64> = conn
            .query_row(
                "SELECT MAX(completed_at) FROM catalog_sync_runs WHERE status IN ('completed', 'partial')",
                [],
                |r| r.get(0),
            )
            .unwrap_or(None);
        let last_attempted_sync_at: Option<i64> = conn
            .query_row("SELECT MAX(started_at) FROM catalog_sync_runs", [], |r| r.get(0))
            .unwrap_or(None);

        let (last_sync_complete, last_sync_error): (bool, Option<String>) = conn
            .query_row(
                "SELECT is_complete, error FROM catalog_sync_runs ORDER BY started_at DESC LIMIT 1",
                [],
                |r| Ok((r.get::<_, i64>(0)? != 0, r.get::<_, Option<String>>(1)?)),
            )
            .unwrap_or((false, None));

        let mut source_counts = Vec::new();
        {
            let mut stmt = conn.prepare(
                "SELECT source, COUNT(*) FROM catalog_packages WHERE is_available = 1 GROUP BY source ORDER BY COUNT(*) DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?.max(0) as usize))
            })?;
            for r in rows {
                source_counts.push(r?);
            }
        }

        let mut category_counts = Vec::new();
        {
            let mut stmt = conn.prepare(
                "SELECT COALESCE(category, 'Uncategorized'), COUNT(*) FROM catalog_packages WHERE is_available = 1 GROUP BY COALESCE(category, 'Uncategorized') ORDER BY COUNT(*) DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?.max(0) as usize))
            })?;
            for r in rows {
                category_counts.push(r?);
            }
        }

        let db_size_bytes = self
            .db_path
            .as_ref()
            .and_then(|p| std::fs::metadata(p).ok())
            .map(|m| m.len())
            .unwrap_or(0);

        Ok(CatalogCacheStats {
            total_packages,
            available_packages,
            enriched_packages,
            last_sync_at,
            last_attempted_sync_at,
            last_sync_complete,
            last_sync_error,
            source_counts,
            category_counts,
            db_size_bytes,
        })
    }

    pub fn clear_catalog_cache(&self) -> Result<(), AppHubError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM catalog_packages", [])?;
        tx.execute("DELETE FROM catalog_sources", [])?;
        tx.execute("DELETE FROM catalog_sync_runs", [])?;
        tx.commit()?;
        Ok(())
    }

    // --- Settings ---
    pub fn get_setting(&self, key: &str) -> Result<Option<String>, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_all_settings(&self) -> Result<Vec<(String, String)>, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        let mut res = Vec::new();
        for r in rows {
            res.push(r?);
        }
        Ok(res)
    }

    // --- Favorites ---
    pub fn get_favorites(&self) -> Result<Vec<String>, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT package_id, source FROM favorites_v5 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            let pkg_id: String = row.get(0)?;
            let src: Option<String> = row.get(1)?;
            Ok(match src {
                Some(s) if !s.trim().is_empty() => format!("{}::{}", s.trim().to_lowercase(), pkg_id),
                _ => pkg_id,
            })
        })?;
        let mut res = Vec::new();
        for r in rows {
            res.push(r?);
        }
        Ok(res)
    }

    pub fn set_favorite(&self, package_id: &str, is_fav: bool) -> Result<(), AppHubError> {
        self.set_favorite_with_source(package_id, None, is_fav)
    }

    pub fn set_favorite_with_source(
        &self,
        package_id: &str,
        source: Option<&str>,
        is_fav: bool,
    ) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        let src_clean = source
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_lowercase());
        let fav_key = match &src_clean {
            Some(s) => format!("{}::{}", s, package_id.trim().to_lowercase()),
            None => package_id.trim().to_lowercase(),
        };

        if is_fav {
            let now = chrono::Utc::now().timestamp_millis();
            conn.execute(
                "INSERT OR REPLACE INTO favorites_v5 (fav_key, package_id, source, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![fav_key, package_id.trim(), src_clean, now],
            )?;
            // Keep legacy table synced for plain IDs for downgrade compatibility
            if src_clean.is_none() {
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO favorites (package_id, created_at) VALUES (?1, ?2)",
                    params![package_id.trim(), now],
                );
            }
        } else {
            conn.execute(
                "DELETE FROM favorites_v5 WHERE fav_key = ?1",
                params![fav_key],
            )?;
            // Also clean matching un-scoped legacy key when explicitly un-starring with source
            if src_clean.is_some() {
                conn.execute(
                    "DELETE FROM favorites_v5 WHERE fav_key = ?1",
                    params![package_id.trim().to_lowercase()],
                )?;
            } else {
                conn.execute(
                    "DELETE FROM favorites_v5 WHERE LOWER(package_id) = ?1",
                    params![package_id.trim().to_lowercase()],
                )?;
            }
            let _ = conn.execute(
                "DELETE FROM favorites WHERE LOWER(package_id) = ?1",
                params![package_id.trim().to_lowercase()],
            );
        }
        Ok(())
    }

    // --- History ---
    #[allow(clippy::too_many_arguments)]
    pub fn insert_history(
        &self,
        id: &str,
        package_id: &str,
        package_name: &str,
        action: &str,
        version: &str,
        status: &str,
        error_message: Option<&str>,
        exit_code: Option<i32>,
        start_time: i64,
        end_time: Option<i64>,
        queued_at: Option<i64>,
        started_at: Option<i64>,
        ended_at: Option<i64>,
        source: Option<&str>,
    ) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        let eff_queued = queued_at.unwrap_or(start_time);
        let eff_ended = ended_at.or(end_time);
        conn.execute(
            "INSERT OR REPLACE INTO installation_history (id, package_id, package_name, action, version, status, error_message, exit_code, start_time, end_time, queued_at, started_at, ended_at, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                id,
                package_id,
                package_name,
                action,
                version,
                status,
                error_message,
                exit_code,
                start_time,
                end_time,
                eff_queued,
                started_at,
                eff_ended,
                source,
            ],
        )?;
        Ok(())
    }

    pub fn get_history(&self, limit: usize) -> Result<Vec<HistoryRecord>, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, package_id, package_name, action, version, status, error_message, exit_code, start_time, end_time, queued_at, started_at, ended_at, source FROM installation_history ORDER BY COALESCE(queued_at, start_time) DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit as i64], |row| {
            Ok(HistoryRecord {
                id: row.get(0)?,
                package_id: row.get(1)?,
                package_name: row.get(2)?,
                action: row.get(3)?,
                version: row.get(4)?,
                status: row.get(5)?,
                error_message: row.get(6)?,
                exit_code: row.get(7)?,
                start_time: row.get(8)?,
                end_time: row.get(9)?,
                source: row.get(13)?,
                queued_at: row.get(10)?,
                started_at: row.get(11)?,
                ended_at: row.get(12)?,
            })
        })?;
        let mut res = Vec::new();
        for r in rows {
            res.push(r?);
        }
        Ok(res)
    }

    pub fn clear_history(&self) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM installation_history", [])?;
        Ok(())
    }

    // --- Icon Cache ---
    pub fn get_cached_icon(&self, cache_key: &str) -> Result<Option<IconCacheRecord>, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT cache_key, package_id, source, source_type, resolved_url, local_path, mime_type, sha256, width, height, status, error_message, fetched_at, expires_at, verified
             FROM icon_cache WHERE cache_key = ?1",
        )?;
        let mut rows = stmt.query(params![cache_key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(IconCacheRecord {
                cache_key: row.get(0)?,
                package_id: row.get(1)?,
                source: row.get(2)?,
                source_type: row.get(3)?,
                resolved_url: row.get(4)?,
                local_path: row.get(5)?,
                mime_type: row.get(6)?,
                sha256: row.get(7)?,
                width: row.get::<_, Option<i64>>(8)?.map(|v| v.max(0) as u32),
                height: row.get::<_, Option<i64>>(9)?.map(|v| v.max(0) as u32),
                status: row.get(10)?,
                error_message: row.get(11)?,
                fetched_at: row.get(12)?,
                expires_at: row.get(13)?,
                verified: row.get::<_, i64>(14)? != 0,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn upsert_cached_icon(&self, rec: &IconCacheRecord) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO icon_cache (
                cache_key, package_id, source, source_type, resolved_url, local_path,
                mime_type, sha256, width, height, status, error_message, fetched_at, expires_at, verified
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                rec.cache_key,
                rec.package_id,
                rec.source,
                rec.source_type,
                rec.resolved_url,
                rec.local_path,
                rec.mime_type,
                rec.sha256,
                rec.width.map(|v| v as i64),
                rec.height.map(|v| v as i64),
                rec.status,
                rec.error_message,
                rec.fetched_at,
                rec.expires_at,
                if rec.verified { 1i64 } else { 0i64 },
            ],
        )?;
        Ok(())
    }

    pub fn invalidate_cached_icon(&self, cache_key: &str) -> Result<usize, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let deleted = conn.execute("DELETE FROM icon_cache WHERE cache_key = ?1", params![cache_key])?;
        Ok(deleted)
    }

    pub fn clear_icon_cache(&self) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM icon_cache", [])?;
        Ok(())
    }

    // --- Collections ---
    pub fn get_collections(&self) -> Result<Vec<CollectionRecord>, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, icon_name, package_ids, created_at, updated_at FROM collections ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            let pkg_ids_str: String = row.get(4)?;
            let package_ids: Vec<String> = serde_json::from_str(&pkg_ids_str).unwrap_or_default();
            Ok(CollectionRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                icon_name: row.get(3)?,
                package_ids,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        let mut res = Vec::new();
        for r in rows {
            res.push(r?);
        }
        Ok(res)
    }

    pub fn save_collection(&self, col: &CollectionRecord) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        let pkg_ids_str = serde_json::to_string(&col.package_ids).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "INSERT OR REPLACE INTO collections (id, name, description, icon_name, package_ids, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![col.id, col.name, col.description, col.icon_name, pkg_ids_str, col.created_at, col.updated_at],
        )?;
        Ok(())
    }

    pub fn delete_collection(&self, id: &str) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM collections WHERE id = ?1", params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_pkg(id: &str, name: &str, version: &str, source: &str) -> WinGetPackage {
        WinGetPackage {
            id: id.to_string(),
            name: name.to_string(),
            publisher: None,
            author: None,
            version: version.to_string(),
            latest_version: version.to_string(),
            description: None,
            category: None,
            source: source.to_string(),
            tags: Vec::new(),
            architectures: Vec::new(),
            license: None,
            license_url: None,
            homepage: None,
            publisher_url: None,
            release_date: None,
            release_notes: None,
            installer_type: None,
            installer_url: None,
            installer_sha256: None,
            download_size_bytes: None,
            installed_size_bytes: None,
            verified: source == "winget" || source == "msstore",
            metadata_status: "summary".to_string(),
            is_available: true,
            last_observed_at: 1700000000,
            last_metadata_refresh_at: None,
            is_installed: false,
            installed_version: None,
            is_pinned: false,
        }
    }

    #[test]
    fn test_sqlite_full_persistence_and_recovery() {
        let db = DatabaseManager::in_memory().expect("Should initialize SQLite memory db");

        // 1. Settings
        db.set_setting("theme", "dark").unwrap();
        assert_eq!(db.get_setting("theme").unwrap(), Some("dark".to_string()));

        // 2. Favorites (source-less + source-scoped isolation)
        db.set_favorite("Git.Git", true).unwrap();
        db.set_favorite_with_source("Mozilla.Firefox", Some("msstore"), true).unwrap();
        let favs = db.get_favorites().unwrap();
        assert_eq!(favs.len(), 2);
        assert!(favs.contains(&"Git.Git".to_string()));
        assert!(favs.contains(&"msstore::Mozilla.Firefox".to_string()));

        db.set_favorite("Git.Git", false).unwrap();
        let favs_after = db.get_favorites().unwrap();
        assert_eq!(favs_after.len(), 1);
        assert_eq!(favs_after[0], "msstore::Mozilla.Firefox");

        // 3. History + startup interrupted recovery (including 'preparing' state)
        db.insert_history(
            "task_active",
            "Git.Git",
            "Git",
            "install",
            "2.47.1",
            "downloading",
            None,
            None,
            1700000100,
            None,
            Some(1700000090),
            Some(1700000100),
            None,
            Some("winget"),
        )
        .unwrap();
        db.insert_history(
            "task_preparing",
            "7zip.7zip",
            "7-Zip",
            "install",
            "24.09",
            "preparing",
            None,
            None,
            1700000150,
            None,
            Some(1700000140),
            Some(1700000150),
            None,
            Some("winget"),
        )
        .unwrap();
        let recovered = db.mark_interrupted_history_failed().unwrap();
        assert_eq!(recovered, 2);
        let hist = db.get_history(10).unwrap();
        assert_eq!(hist[0].status, "failed");
        assert!(hist[0].error_message.is_some());
        assert!(hist[0].ended_at.is_some());
        assert_eq!(hist[0].source.as_deref(), Some("winget"));

        db.insert_history(
            "task_1",
            "Microsoft.VisualStudioCode",
            "Visual Studio Code",
            "install",
            "1.95.3",
            "completed",
            None,
            Some(0),
            1700000200,
            Some(1700000250),
            Some(1700000190),
            Some(1700000200),
            Some(1700000250),
            Some("winget"),
        )
        .unwrap();
        let hist2 = db.get_history(10).unwrap();
        assert_eq!(hist2.len(), 3);
        assert_eq!(hist2[0].exit_code, Some(0));
        assert_eq!(hist2[0].queued_at, Some(1700000190));

        db.clear_history().unwrap();
        assert_eq!(db.get_history(10).unwrap().len(), 0);

        // 3b. Native Icon Cache CRUD
        let icon_rec = IconCacheRecord {
            cache_key: "winget::microsoft.visualstudiocode".to_string(),
            package_id: "Microsoft.VisualStudioCode".to_string(),
            source: "winget".to_string(),
            source_type: "official-cdn".to_string(),
            resolved_url: Some("https://code.visualstudio.com/assets/images/code-stable.png".to_string()),
            local_path: Some("/tmp/vscode.png".to_string()),
            mime_type: Some("image/png".to_string()),
            sha256: Some("abc".to_string()),
            width: Some(128),
            height: Some(128),
            status: "verified".to_string(),
            error_message: None,
            fetched_at: 1700000000,
            expires_at: 1700604800,
            verified: true,
        };
        db.upsert_cached_icon(&icon_rec).unwrap();
        let loaded_icon = db.get_cached_icon("winget::microsoft.visualstudiocode").unwrap().unwrap();
        assert!(loaded_icon.verified);
        assert_eq!(loaded_icon.width, Some(128));
        assert_eq!(db.invalidate_cached_icon("winget::microsoft.visualstudiocode").unwrap(), 1);
        assert!(db.get_cached_icon("winget::microsoft.visualstudiocode").unwrap().is_none());

        // 4. Collections
        let col = CollectionRecord {
            id: "col_dev".to_string(),
            name: "Dev Tools".to_string(),
            description: "Developer bundle".to_string(),
            icon_name: "Code".to_string(),
            package_ids: vec!["Git.Git".to_string(), "Docker.DockerDesktop".to_string()],
            created_at: "2024-11-01".to_string(),
            updated_at: "2024-11-20".to_string(),
        };
        db.save_collection(&col).unwrap();
        let cols = db.get_collections().unwrap();
        assert_eq!(cols.len(), 1);
        assert_eq!(cols[0].name, "Dev Tools");
        assert_eq!(cols[0].package_ids.len(), 2);

        db.delete_collection("col_dev").unwrap();
        assert_eq!(db.get_collections().unwrap().len(), 0);
    }

    #[test]
    fn test_catalog_reconciliation_multisource_favorites_and_partial_scans() {
        let db = DatabaseManager::in_memory().expect("Should initialize SQLite memory db");
        db.set_favorite("Git.Git", true).unwrap();

        // Sync 1: Complete winget scan with 2 packages + msstore scan with 1 package (same ID permitted across sources)
        let winget_r1 = vec![
            sample_pkg("Git.Git", "Git", "2.47.0", "winget"),
            sample_pkg("7zip.7zip", "7-Zip", "24.08", "winget"),
        ];
        let c1 = db.reconcile_source_catalog("winget", &winget_r1, true, 1000).unwrap();
        assert_eq!(c1.inserted, 2);
        assert_eq!(c1.updated, 0);

        let msstore_r1 = vec![
            sample_pkg("9NKSQGP7F2NH", "WhatsApp", "2.24.0", "msstore"),
            sample_pkg("Git.Git", "Git (Store)", "2.47.0", "msstore"),
        ];
        let c2 = db.reconcile_source_catalog("msstore", &msstore_r1, true, 1001).unwrap();
        assert_eq!(c2.inserted, 2);

        // Enrich Git.Git in winget via winget show
        let show = WinGetShowDetails {
            id: "Git.Git".to_string(),
            name: "Git".to_string(),
            publisher: Some("The Git Development Community".to_string()),
            version: "2.47.0".to_string(),
            author: None,
            description: Some("Distributed version control system.".to_string()),
            homepage: Some("https://gitforwindows.org".to_string()),
            publisher_url: None,
            license: Some("GPL-2.0".to_string()),
            license_url: None,
            release_date: None,
            release_notes: None,
            installer_type: Some("inno".to_string()),
            installer_url: None,
            installer_sha256: None,
            download_size_bytes: Some(68_000_000),
            architectures: vec!["x64".to_string()],
            tags: vec!["git".to_string(), "vcs".to_string()],
        };
        db.update_package_metadata_from_show("Git.Git", Some("winget"), &show, Some("Development"))
            .unwrap();

        // Sync 2: Partial (incomplete) winget scan containing only Git.Git (updated version) must NOT mark 7zip unavailable!
        let winget_partial = vec![sample_pkg("Git.Git", "Git", "2.47.1", "winget")];
        let c3 = db
            .reconcile_source_catalog("winget", &winget_partial, false, 2000)
            .unwrap();
        assert_eq!(c3.updated, 1);
        assert_eq!(c3.marked_unavailable, 0);

        let pkgs_after_partial = db.get_catalog_packages(false).unwrap();
        assert_eq!(pkgs_after_partial.len(), 4);
        let git_winget = pkgs_after_partial
            .iter()
            .find(|p| p.id == "Git.Git" && p.source == "winget")
            .unwrap();
        assert_eq!(git_winget.latest_version, "2.47.1");
        // Enriched metadata was preserved across summary scan!
        assert_eq!(git_winget.publisher.as_deref(), Some("The Git Development Community"));
        assert_eq!(git_winget.category.as_deref(), Some("Development"));
        assert_eq!(git_winget.metadata_status, "enriched");

        // Sync 3: Complete winget scan omitting 7zip marks ONLY 7zip unavailable, leaves msstore untouched
        let c4 = db
            .reconcile_source_catalog("winget", &winget_partial, true, 3000)
            .unwrap();
        assert_eq!(c4.marked_unavailable, 1);

        let available_now = db.get_catalog_packages(false).unwrap();
        assert_eq!(available_now.len(), 3);
        // Favorites survive regardless of catalog changes
        assert_eq!(db.get_favorites().unwrap(), vec!["Git.Git".to_string()]);
    }
}
