use crate::errors::AppHubError;
use crate::models::{CollectionRecord, HistoryRecord};
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

pub struct DatabaseManager {
    conn: Mutex<Connection>,
}

impl DatabaseManager {
    pub fn new(path: &Path) -> Result<Self, AppHubError> {
        let conn = Connection::open(path)?;
        let db = DatabaseManager {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    pub fn in_memory() -> Result<Self, AppHubError> {
        let conn = Connection::open_in_memory()?;
        let db = DatabaseManager {
            conn: Mutex::new(conn),
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

        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?1)",
            params![now],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, ?1)",
            params![now],
        )?;

        Ok(())
    }

    /// Transitions any tasks left in an active state from a previous session to 'failed'
    pub fn mark_interrupted_history_failed(&self) -> Result<usize, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        let updated = conn.execute(
            "UPDATE installation_history
             SET status = 'failed',
                 error_message = COALESCE(error_message, 'Operation interrupted before completion (application exited)'),
                 end_time = COALESCE(end_time, ?1)
             WHERE status IN ('queued', 'downloading', 'verifying', 'installing')",
            params![now],
        )?;
        Ok(updated)
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
        let mut stmt = conn.prepare("SELECT package_id FROM favorites ORDER BY created_at DESC")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        let mut res = Vec::new();
        for r in rows {
            res.push(r?);
        }
        Ok(res)
    }

    pub fn set_favorite(&self, package_id: &str, is_fav: bool) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        if is_fav {
            let now = chrono::Utc::now().timestamp_millis();
            conn.execute(
                "INSERT OR REPLACE INTO favorites (package_id, created_at) VALUES (?1, ?2)",
                params![package_id, now],
            )?;
        } else {
            conn.execute(
                "DELETE FROM favorites WHERE package_id = ?1",
                params![package_id],
            )?;
        }
        Ok(())
    }

    // --- History ---
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
    ) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO installation_history (id, package_id, package_name, action, version, status, error_message, exit_code, start_time, end_time) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, package_id, package_name, action, version, status, error_message, exit_code, start_time, end_time],
        )?;
        Ok(())
    }

    pub fn get_history(&self, limit: usize) -> Result<Vec<HistoryRecord>, AppHubError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, package_id, package_name, action, version, status, error_message, exit_code, start_time, end_time FROM installation_history ORDER BY start_time DESC LIMIT ?1",
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

    #[test]
    fn test_sqlite_full_persistence_and_recovery() {
        let db = DatabaseManager::in_memory().expect("Should initialize SQLite memory db");

        // 1. Settings
        db.set_setting("theme", "dark").unwrap();
        assert_eq!(db.get_setting("theme").unwrap(), Some("dark".to_string()));

        // 2. Favorites
        db.set_favorite("Git.Git", true).unwrap();
        db.set_favorite("Mozilla.Firefox", true).unwrap();
        let favs = db.get_favorites().unwrap();
        assert_eq!(favs.len(), 2);
        assert!(favs.contains(&"Git.Git".to_string()));

        db.set_favorite("Git.Git", false).unwrap();
        let favs_after = db.get_favorites().unwrap();
        assert_eq!(favs_after.len(), 1);
        assert_eq!(favs_after[0], "Mozilla.Firefox");

        // 3. History + startup interrupted recovery
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
        )
        .unwrap();
        let recovered = db.mark_interrupted_history_failed().unwrap();
        assert_eq!(recovered, 1);
        let hist = db.get_history(10).unwrap();
        assert_eq!(hist[0].status, "failed");
        assert!(hist[0].error_message.is_some());

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
        )
        .unwrap();
        let hist2 = db.get_history(10).unwrap();
        assert_eq!(hist2.len(), 2);
        assert_eq!(hist2[0].exit_code, Some(0));

        db.clear_history().unwrap();
        assert_eq!(db.get_history(10).unwrap().len(), 0);

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
}
