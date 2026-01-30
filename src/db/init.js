#!/usr/bin/env node
import { initDb, closeDb } from './database.js';

try {
  initDb();
  console.log('✓ Database initialized at data/job-apply.db');
} catch (error) {
  console.error('Failed to initialize database:', error.message);
  process.exit(1);
} finally {
  closeDb();
}
