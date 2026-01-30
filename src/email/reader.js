import { ImapFlow } from 'imapflow';
import { getConfig } from '../utils/config.js';
import { contacts, emails, getDb } from '../db/database.js';
import logger from '../utils/logger.js';

function createImapClient() {
  const config = getConfig();
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: config.email.from.email,
      pass: config.email.gmailAppPassword
    },
    logger: false
  });
}

// Get Gmail profile info
export async function getProfile() {
  const config = getConfig();
  const client = createImapClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const info = { emailAddress: config.email.from.email, messagesTotal: client.mailbox.exists };
    lock.release();
    return info;
  } finally {
    await client.logout();
  }
}

// List recent inbox messages
export async function inbox(maxResults = 10) {
  const client = createImapClient();
  const result = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Fetch the latest N messages
      const total = client.mailbox.exists;
      if (total === 0) return result;

      const start = Math.max(1, total - maxResults + 1);
      const range = `${start}:${total}`;

      for await (const msg of client.fetch(range, {
        envelope: true,
        source: false
      })) {
        result.push({
          id: msg.uid,
          seq: msg.seq,
          from: msg.envelope.from?.[0] ? `${msg.envelope.from[0].name || ''} <${msg.envelope.from[0].address}>` : '',
          to: msg.envelope.to?.[0]?.address || '',
          subject: msg.envelope.subject || '(no subject)',
          date: msg.envelope.date?.toISOString() || '',
          labels: msg.flags ? [...msg.flags] : []
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return result.reverse();
}

// Search messages
export async function search(query, maxResults = 10) {
  const client = createImapClient();
  const result = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const uids = await client.search({ or: [
        { subject: query },
        { from: query },
        { body: query }
      ] });

      const selected = uids.slice(-maxResults);

      if (selected.length > 0) {
        for await (const msg of client.fetch(selected, {
          envelope: true,
          uid: true
        }, { uid: true })) {
          result.push({
            id: msg.uid,
            seq: msg.seq,
            from: msg.envelope.from?.[0] ? `${msg.envelope.from[0].name || ''} <${msg.envelope.from[0].address}>` : '',
            to: msg.envelope.to?.[0]?.address || '',
            subject: msg.envelope.subject || '(no subject)',
            date: msg.envelope.date?.toISOString() || '',
            labels: msg.flags ? [...msg.flags] : []
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return result.reverse();
}

// Read a specific message by UID
export async function readMessage(uid) {
  const client = createImapClient();

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const msg = await client.fetchOne(uid, {
        envelope: true,
        source: true
      }, { uid: true });

      // Mark as read
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });

      const body = msg.source?.toString('utf-8') || '';
      // Extract plain text body from raw source
      const plainBody = extractPlainText(body);

      return {
        id: msg.uid,
        from: msg.envelope.from?.[0] ? `${msg.envelope.from[0].name || ''} <${msg.envelope.from[0].address}>` : '',
        to: msg.envelope.to?.[0]?.address || '',
        subject: msg.envelope.subject || '(no subject)',
        date: msg.envelope.date?.toISOString() || '',
        body: plainBody,
        labels: msg.flags ? [...msg.flags] : []
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

// Check for replies from contacts in database
export async function checkReplies() {
  const client = createImapClient();
  const contactedStatuses = ['contacted', 'followup_1', 'followup_2', 'followup_final'];
  const allContacted = [];

  for (const status of contactedStatuses) {
    allContacted.push(...contacts.getByStatus(status, 200));
  }

  if (allContacted.length === 0) {
    logger.info('No contacted recipients to check');
    return [];
  }

  const replies = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      for (const contact of allContacted) {
        const uids = await client.search({ from: contact.email });

        if (uids.length > 0) {
          // Get the most recent message
          const latestUid = uids[uids.length - 1];
          const msg = await client.fetchOne(latestUid, {
            envelope: true
          }, { uid: true });

          logger.success(`Reply found from ${contact.email}: "${msg.envelope.subject}"`);

          contacts.updateStatus(contact.id, 'replied');

          const db = getDb();
          db.prepare(`UPDATE emails SET replied_at = datetime('now') WHERE contact_id = ? AND status = 'sent'`)
            .run(contact.id);

          replies.push({
            contact,
            message: {
              subject: msg.envelope.subject,
              date: msg.envelope.date?.toISOString(),
              snippet: ''
            }
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  logger.info(`Found ${replies.length} replies out of ${allContacted.length} contacted`);
  return replies;
}

// Extract plain text from raw email source
function extractPlainText(rawSource) {
  // Look for text/plain content
  const boundaryMatch = rawSource.match(/boundary="?([^"\r\n]+)"?/);

  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = rawSource.split('--' + boundary);

    for (const part of parts) {
      if (part.includes('text/plain')) {
        // Find the empty line that separates headers from body
        const bodyStart = part.indexOf('\r\n\r\n');
        if (bodyStart !== -1) {
          let body = part.substring(bodyStart + 4).trim();
          // Remove trailing boundary markers
          body = body.replace(/--$/, '').trim();

          // Handle base64 encoding
          if (part.includes('Content-Transfer-Encoding: base64')) {
            try {
              body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8');
            } catch { /* keep as-is */ }
          }
          // Handle quoted-printable
          if (part.includes('Content-Transfer-Encoding: quoted-printable')) {
            body = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) =>
              String.fromCharCode(parseInt(hex, 16))
            );
          }

          return body;
        }
      }
    }
  }

  // Fallback: no multipart, just get body after headers
  const bodyStart = rawSource.indexOf('\r\n\r\n');
  if (bodyStart !== -1) {
    return rawSource.substring(bodyStart + 4).trim();
  }

  return rawSource;
}
