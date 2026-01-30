#!/usr/bin/env node

/**
 * Database Migration Runner
 *
 * Runs SQL migration files in order.
 * Each migration runs once and is tracked in the _migrations table.
 *
 * Usage: node src/db/migrate.js
 *
 * To add a new migration:
 *   1. Create a file: src/db/migrations/NNN_description.sql
 *   2. Name format: 001_initial.sql, 002_add_tags.sql, etc.
 *   3. Include at the end: INSERT OR IGNORE INTO _migrations (name) VALUES ('NNN_description');
 *   4. Run: node src/db/migrate.js
 */

import { getDb, closeDb } from './database.js';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function getAppliedMigrations(db) {
  return db.prepare('SELECT name FROM _migrations ORDER BY name').all().map(r => r.name);
}

function runMigrations() {
  const db = getDb();
  ensureMigrationsTable(db);

  const applied = getAppliedMigrations(db);
  const migrationsDir = join(__dirname, 'migrations');

  let files;
  try {
    files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
  } catch {
    console.log('No migrations directory found. Nothing to do.');
    return;
  }

  let count = 0;

  for (const file of files) {
    const name = file.replace('.sql', '');

    if (applied.includes(name)) {
      continue;
    }

    console.log(`Applying migration: ${name}`);
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');

    try {
      db.exec(sql);
      // Ensure migration is recorded even if the SQL didn't include the INSERT
      db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(name);
      console.log(`  ✓ ${name} applied`);
      count++;
    } catch (error) {
      console.error(`  ✗ ${name} failed:`, error.message);
      process.exit(1);
    }
  }

  if (count === 0) {
    console.log('All migrations are up to date.');
  } else {
    console.log(`\n${count} migration(s) applied.`);
  }
}

try {
  runMigrations();
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
} finally {
  closeDb();
}
