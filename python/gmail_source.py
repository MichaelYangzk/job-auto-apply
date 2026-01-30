"""
Gmail IMAP Source — replaces OneDrive/Excel as the email data source.

Reads emails directly from Gmail via IMAP and returns rows compatible
with the existing LLM + Notion sync pipeline.
"""

import imaplib
import email
from email.header import decode_header
from datetime import datetime, timezone
import os
import re
import hashlib
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

IMAP_HOST = os.getenv("IMAP_HOST", "imap.gmail.com")
IMAP_PORT = int(os.getenv("IMAP_PORT", "993"))
IMAP_USER = os.getenv("FROM_EMAIL", "")
IMAP_PASS = os.getenv("GMAIL_APP_PASSWORD", "")


def _decode_str(raw):
    """Decode RFC2047 encoded header string."""
    if raw is None:
        return ""
    parts = decode_header(raw)
    decoded = []
    for data, charset in parts:
        if isinstance(data, bytes):
            decoded.append(data.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(str(data))
    return " ".join(decoded).strip()


def _extract_body(msg):
    """Extract plain text body from email message."""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if ct == "text/plain" and "attachment" not in cd:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    return payload.decode(charset, errors="replace")
        # Fallback to HTML
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    html = payload.decode(charset, errors="replace")
                    return re.sub(r"<[^>]+>", "", html).strip()
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            return payload.decode(charset, errors="replace")
    return ""


def _extract_company(from_addr, subject):
    """Guess company name from email domain or subject."""
    match = re.search(r"@([\w.-]+)", from_addr)
    if match:
        domain = match.group(1).lower()
        # Skip generic email providers
        generic = {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"}
        if domain not in generic:
            # Use domain without TLD as company name
            return domain.split(".")[0].title()
    return ""


def _make_conversation_id(msg):
    """Generate a stable conversation ID from References/In-Reply-To or Message-ID."""
    refs = msg.get("References", "")
    in_reply = msg.get("In-Reply-To", "")
    msg_id = msg.get("Message-ID", "")

    # Use the first reference (original message) as thread key
    if refs:
        first_ref = refs.strip().split()[0]
        return hashlib.md5(first_ref.encode()).hexdigest()[:16]
    if in_reply:
        return hashlib.md5(in_reply.strip().encode()).hexdigest()[:16]
    if msg_id:
        return hashlib.md5(msg_id.strip().encode()).hexdigest()[:16]
    return ""


def fetch_emails(folder="INBOX", search_criteria="UNSEEN", limit=50):
    """
    Fetch emails from Gmail IMAP and return as list of dicts
    compatible with the email_to_notion pipeline.

    Each dict has keys matching the expected schema:
    - message_id, conversation_id, from, subject, company,
      received_utc, body, llm_status
    """
    if not IMAP_USER or not IMAP_PASS:
        raise ValueError("FROM_EMAIL and GMAIL_APP_PASSWORD required in .env")

    conn = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    conn.login(IMAP_USER, IMAP_PASS)
    conn.select(folder, readonly=True)

    _, data = conn.search(None, search_criteria)
    uids = data[0].split()

    if limit:
        uids = uids[-limit:]

    rows = []
    for uid in uids:
        _, msg_data = conn.fetch(uid, "(RFC822)")
        if not msg_data or not msg_data[0]:
            continue

        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw)

        from_addr = _decode_str(msg.get("From", ""))
        subject = _decode_str(msg.get("Subject", ""))
        date_str = msg.get("Date", "")
        message_id = msg.get("Message-ID", "")
        body = _extract_body(msg)

        # Parse date
        try:
            dt = email.utils.parsedate_to_datetime(date_str)
            received_utc = dt.astimezone(timezone.utc).isoformat()
        except Exception:
            received_utc = datetime.now(timezone.utc).isoformat()

        conversation_id = _make_conversation_id(msg)
        company = _extract_company(from_addr, subject)

        rows.append({
            "message_id": message_id.strip() if message_id else "",
            "conversation_id": conversation_id,
            "from": from_addr,
            "subject": subject,
            "company": company,
            "received_utc": received_utc,
            "body": body[:5000],  # Truncate very long emails
            "llm_status": "NEW",
            "error_msg": "",
            "notion_page_id": "",
            "stage": "",
            "priority": "",
            "next_action": "",
            "summary": "",
            "importance_score": "",
        })

    conn.logout()
    return rows


def fetch_recent(days=7, limit=50):
    """Fetch emails from the last N days."""
    from datetime import timedelta
    since = (datetime.now() - timedelta(days=days)).strftime("%d-%b-%Y")
    return fetch_emails(search_criteria=f'(SINCE "{since}")', limit=limit)


def fetch_from_contacts(contact_emails, limit=100):
    """Fetch emails from specific contact email addresses."""
    if not contact_emails:
        return []

    all_rows = []
    for addr in contact_emails:
        rows = fetch_emails(search_criteria=f'(FROM "{addr}")', limit=limit)
        all_rows.extend(rows)

    # Deduplicate by message_id
    seen = set()
    unique = []
    for row in all_rows:
        mid = row["message_id"]
        if mid and mid not in seen:
            seen.add(mid)
            unique.append(row)

    return unique
