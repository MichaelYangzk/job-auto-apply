-- Migration 001: Initial schema
-- This is the baseline migration matching schema.sql

-- Migration tracking table
CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO _migrations (name) VALUES ('001_initial');
