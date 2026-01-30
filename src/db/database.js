import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

export function getDb() {
  if (!db) {
    const dbPath = process.env.DB_PATH || join(__dirname, '../../data/job-apply.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDb() {
  const database = getDb();
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  database.exec(schema);
  console.log('Database initialized successfully');
  return database;
}

// Company operations
export const companies = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO companies (name, website, industry, size, location, funding_stage, source, notes, priority)
      VALUES (@name, @website, @industry, @size, @location, @funding_stage, @source, @notes, @priority)
    `);
    return stmt.run(data);
  },

  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  },

  getAll(options = {}) {
    const db = getDb();
    let query = 'SELECT * FROM companies';
    const params = [];

    if (options.priority) {
      query += ' WHERE priority >= ?';
      params.push(options.priority);
    }

    query += ' ORDER BY priority DESC, created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    return db.prepare(query).all(...params);
  },

  update(id, data) {
    const db = getDb();
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
    const stmt = db.prepare(`UPDATE companies SET ${fields} WHERE id = @id`);
    return stmt.run({ ...data, id });
  },

  delete(id) {
    const db = getDb();
    return db.prepare('DELETE FROM companies WHERE id = ?').run(id);
  }
};

// Contact operations
export const contacts = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO contacts (company_id, name, first_name, last_name, email, title, linkedin, source, status)
      VALUES (@company_id, @name, @first_name, @last_name, @email, @title, @linkedin, @source, @status)
    `);
    return stmt.run({
      status: 'new',
      ...data
    });
  },

  getById(id) {
    const db = getDb();
    return db.prepare(`
      SELECT c.*, comp.name as company_name, comp.website as company_website
      FROM contacts c
      LEFT JOIN companies comp ON c.company_id = comp.id
      WHERE c.id = ?
    `).get(id);
  },

  getByEmail(email) {
    const db = getDb();
    return db.prepare('SELECT * FROM contacts WHERE email = ?').get(email);
  },

  getByStatus(status, limit = 50) {
    const db = getDb();
    return db.prepare(`
      SELECT c.*, comp.name as company_name, comp.website as company_website
      FROM contacts c
      LEFT JOIN companies comp ON c.company_id = comp.id
      WHERE c.status = ?
      ORDER BY c.created_at ASC
      LIMIT ?
    `).all(status, limit);
  },

  getPendingFollowups() {
    const db = getDb();
    return db.prepare(`
      SELECT c.*, comp.name as company_name,
        (SELECT MAX(sent_at) FROM emails WHERE contact_id = c.id) as last_email_date,
        (SELECT COUNT(*) FROM emails WHERE contact_id = c.id AND status = 'sent') as emails_sent
      FROM contacts c
      LEFT JOIN companies comp ON c.company_id = comp.id
      WHERE c.status IN ('contacted', 'followup_1', 'followup_2')
      ORDER BY last_email_date ASC
    `).all();
  },

  updateStatus(id, status) {
    const db = getDb();
    return db.prepare('UPDATE contacts SET status = ? WHERE id = ?').run(status, id);
  },

  getAll(options = {}) {
    const db = getDb();
    let query = `
      SELECT c.*, comp.name as company_name
      FROM contacts c
      LEFT JOIN companies comp ON c.company_id = comp.id
    `;

    if (options.status) {
      query += ` WHERE c.status = '${options.status}'`;
    }

    query += ' ORDER BY c.created_at DESC';

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    return db.prepare(query).all();
  }
};

// Email operations
export const emails = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO emails (contact_id, template_name, subject, body, status, scheduled_at, followup_number)
      VALUES (@contact_id, @template_name, @subject, @body, @status, @scheduled_at, @followup_number)
    `);
    return stmt.run({
      status: 'draft',
      followup_number: 0,
      ...data
    });
  },

  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
  },

  getScheduled(limit = 10) {
    const db = getDb();
    return db.prepare(`
      SELECT e.*, c.email as to_email, c.first_name, c.name as contact_name,
             comp.name as company_name
      FROM emails e
      JOIN contacts c ON e.contact_id = c.id
      LEFT JOIN companies comp ON c.company_id = comp.id
      WHERE e.status = 'scheduled'
        AND e.scheduled_at <= datetime('now')
      ORDER BY e.scheduled_at ASC
      LIMIT ?
    `).all(limit);
  },

  markSent(id) {
    const db = getDb();
    return db.prepare(`
      UPDATE emails SET status = 'sent', sent_at = datetime('now') WHERE id = ?
    `).run(id);
  },

  markFailed(id, errorMessage) {
    const db = getDb();
    return db.prepare(`
      UPDATE emails SET status = 'failed', error_message = ? WHERE id = ?
    `).run(errorMessage, id);
  },

  getByContact(contactId) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM emails WHERE contact_id = ? ORDER BY created_at DESC
    `).all(contactId);
  },

  getTodayCount() {
    const db = getDb();
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM emails
      WHERE status = 'sent' AND date(sent_at) = date('now')
    `).get();
    return result.count;
  }
};

// Blacklist operations
export const blacklist = {
  add(email, reason = '') {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO blacklist (email, reason) VALUES (?, ?)
    `);
    return stmt.run(email, reason);
  },

  check(email) {
    const db = getDb();
    const result = db.prepare('SELECT * FROM blacklist WHERE email = ?').get(email);
    return !!result;
  },

  remove(email) {
    const db = getDb();
    return db.prepare('DELETE FROM blacklist WHERE email = ?').run(email);
  },

  getAll() {
    const db = getDb();
    return db.prepare('SELECT * FROM blacklist ORDER BY created_at DESC').all();
  }
};

// Stats
export function getStats() {
  const db = getDb();

  const contactStats = db.prepare(`
    SELECT status, COUNT(*) as count FROM contacts GROUP BY status
  `).all();

  const emailStats = db.prepare(`
    SELECT status, COUNT(*) as count FROM emails GROUP BY status
  `).all();

  const todaySent = emails.getTodayCount();

  const replyRate = db.prepare(`
    SELECT
      COUNT(CASE WHEN replied_at IS NOT NULL THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as rate
    FROM emails WHERE status = 'sent'
  `).get();

  return {
    contacts: Object.fromEntries(contactStats.map(s => [s.status, s.count])),
    emails: Object.fromEntries(emailStats.map(s => [s.status, s.count])),
    todaySent,
    replyRate: replyRate?.rate || 0
  };
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
