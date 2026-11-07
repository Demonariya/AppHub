use crate::errors::AppHubError;
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
            CREATE TABLE IF NOT EXISTS packages_cache (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                publisher TEXT NOT NULL,
                version TEXT NOT NULL,
                latest_version TEXT NOT NULL,
                description TEXT,
                category TEXT,
                source TEXT,
                license TEXT,
                is_installed BOOLEAN DEFAULT 0,
                installed_version TEXT,
                is_pinned BOOLEAN DEFAULT 0,
                pinned_version TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS installation_history (
                id TEXT PRIMARY KEY,
                package_id TEXT NOT NULL,
                package_name TEXT NOT NULL,
                action TEXT NOT NULL,
                version TEXT NOT NULL,
                status TEXT NOT NULL,
                error_message TEXT,
                start_time INTEGER NOT NULL,
                end_time INTEGER
            );

            CREATE TABLE IF NOT EXISTS collections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                icon TEXT,
                package_ids TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_history_pkg ON installation_history(package_id);
            CREATE INDEX IF NOT EXISTS idx_cache_cat ON packages_cache(category);
            "#,
        )?;

        Ok(())
    }

    pub fn insert_history(
        &self,
        id: &str,
        package_id: &str,
        package_name: &str,
        action: &str,
        version: &str,
        status: &str,
        error_message: Option<&str>,
        start_time: i64,
        end_time: Option<i64>,
    ) -> Result<(), AppHubError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO installation_history (id, package_id, package_name, action, version, status, error_message, start_time, end_time) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, package_id, package_name, action, version, status, error_message, start_time, end_time],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sqlite_migration_and_insert() {
        let db = DatabaseManager::in_memory().expect("Should initialize SQLite memory db");
        let res = db.insert_history(
            "task_1",
            "Microsoft.VisualStudioCode",
            "Visual Studio Code",
            "install",
            "1.95.3",
            "completed",
            None,
            1700000000,
            Some(1700000050),
        );
        assert!(res.is_ok());
    }
}
