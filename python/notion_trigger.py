"""
Notion Trigger — polls Notion database for action commands and triggers email operations.

Inspired by notion-trigger (TypeScript), reimplemented in Python for
the email_to_notion pipeline.

Bidirectional flow:
  - PULL: Read rows where "Action Confirm" is checked → execute the "Next Action"
  - PUSH: After execution, update status/stage back in Notion

Supported actions (triggered via "Next Action" column in Notion):
  - reply          → schedule a followup email
  - follow_up      → schedule a followup email
  - send_cold      → send initial cold email (requires email, name, company)
  - archive        → mark contact as not-interested
  - ignore         → skip, do nothing
  - schedule       → schedule interview-related email
"""

import os
import time
import requests
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

NOTION_TOKEN = os.getenv("NOTION_TOKEN", "")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID", "")
NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

# Actions that trigger email sending
SEND_ACTIONS = {"reply", "follow_up", "send_cold", "schedule"}
# Actions that update status only
STATUS_ACTIONS = {"archive", "ignore"}


def _headers():
    return {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _extract_text(prop):
    """Extract plain text from a Notion property value."""
    ptype = prop.get("type")
    if ptype == "title":
        return "".join(t.get("plain_text", "") for t in prop.get("title", []))
    if ptype == "rich_text":
        return "".join(t.get("plain_text", "") for t in prop.get("rich_text", []))
    if ptype == "select":
        sel = prop.get("select")
        return sel.get("name", "") if sel else ""
    if ptype == "number":
        return prop.get("number")
    if ptype == "checkbox":
        return prop.get("checkbox", False)
    if ptype == "url":
        return prop.get("url", "")
    if ptype == "date":
        d = prop.get("date")
        return d.get("start", "") if d else ""
    return ""


def query_actionable_rows():
    """
    Query Notion database for rows where:
    - "Action Confirm" checkbox is checked (user approved the action)
    - "Next Action" is not empty
    """
    if not NOTION_TOKEN or not NOTION_DATABASE_ID:
        raise ValueError("NOTION_TOKEN and NOTION_DATABASE_ID required in .env")

    url = f"{NOTION_API_BASE}/databases/{NOTION_DATABASE_ID}/query"
    payload = {
        "filter": {
            "and": [
                {"property": "Action Confirm", "checkbox": {"equals": True}},
            ]
        },
        "sorts": [
            {"property": "Importance Score", "direction": "descending"}
        ],
    }

    resp = requests.post(url, headers=_headers(), json=payload)
    resp.raise_for_status()
    data = resp.json()

    rows = []
    for page in data.get("results", []):
        props = page.get("properties", {})
        row = {
            "notion_page_id": page["id"],
            "name": _extract_text(props.get("Name", {})),
            "company": _extract_text(props.get("Company", {})),
            "from": _extract_text(props.get("From", {})),
            "subject": _extract_text(props.get("Subject", {})),
            "stage": _extract_text(props.get("Stage", {})),
            "priority": _extract_text(props.get("Priority", {})),
            "next_action": _extract_text(props.get("Next Action", {})),
            "summary": _extract_text(props.get("Summary", {})),
            "email_link": _extract_text(props.get("Email Link", {})),
            "conversation_id": _extract_text(props.get("Conversation ID", {})),
            "importance_score": _extract_text(props.get("Importance Score", {})),
        }
        if row["next_action"]:
            rows.append(row)

    return rows


def update_notion_status(page_id, updates):
    """Update a Notion page's properties after action execution."""
    url = f"{NOTION_API_BASE}/pages/{page_id}"

    properties = {}

    # Always uncheck "Action Confirm" after processing
    properties["Action Confirm"] = {"checkbox": False}

    if "stage" in updates:
        properties["Stage"] = {"select": {"name": updates["stage"]}}

    if "next_action" in updates:
        properties["Next Action"] = {
            "rich_text": [{"type": "text", "text": {"content": updates["next_action"]}}]
        }

    if "summary" in updates:
        properties["Summary"] = {
            "rich_text": [{"type": "text", "text": {"content": updates["summary"]}}]
        }

    if "error" in updates:
        properties["Error"] = {
            "rich_text": [{"type": "text", "text": {"content": updates["error"]}}]
        }

    # Mark status as updated
    properties["Status Updated"] = {"checkbox": True}

    resp = requests.patch(url, headers=_headers(), json={"properties": properties})
    resp.raise_for_status()
    return resp.json()


def append_notion_log(page_id, message):
    """Append a log entry as a callout block to the Notion page."""
    url = f"{NOTION_API_BASE}/blocks/{page_id}/children"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    text = f"[{timestamp}] {message}"

    payload = {
        "children": [
            {
                "object": "block",
                "type": "callout",
                "callout": {
                    "icon": {"type": "emoji", "emoji": "📧"},
                    "rich_text": [{"type": "text", "text": {"content": text}}],
                },
            }
        ]
    }

    resp = requests.patch(url, headers=_headers(), json=payload)
    resp.raise_for_status()


def execute_action(row):
    """
    Execute the action specified in a Notion row.
    Returns a dict with status updates to write back.
    """
    from email_actions import (
        send_cold_email, schedule_email, mark_replied,
        mark_not_interested, check_replies, queue_followups,
    )

    action = row["next_action"].strip().lower()
    page_id = row["notion_page_id"]
    company = row["company"]
    from_addr = row["from"]

    print(f"  [ACTION] {action} for {company or from_addr} (page: {page_id[:8]}...)")

    if action == "send_cold":
        # Extract email from "From" field
        import re
        email_match = re.search(r"[\w.+-]+@[\w.-]+", from_addr)
        if not email_match:
            return {"error": f"No email found in From: {from_addr}"}

        result = send_cold_email(
            email_addr=email_match.group(),
            name=row.get("name", ""),
            company=company,
        )
        if result.get("success"):
            return {
                "stage": "applied",
                "next_action": "follow_up",
                "summary": f"Cold email sent to {email_match.group()}",
            }
        return {"error": result.get("error", "Send failed")}

    elif action in ("reply", "follow_up"):
        result = queue_followups()
        if result.get("success"):
            return {
                "next_action": "",
                "summary": f"Followup queued at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}",
            }
        return {"error": result.get("stderr", "Followup scheduling failed")}

    elif action == "archive":
        return {
            "stage": "withdrawn",
            "next_action": "",
            "summary": "Archived by user",
        }

    elif action == "ignore":
        return {
            "next_action": "",
            "summary": "Ignored by user",
        }

    elif action == "schedule":
        return {
            "next_action": "follow_up",
            "summary": f"Scheduled for follow-up",
        }

    else:
        return {"error": f"Unknown action: {action}"}


def run_trigger_cycle():
    """
    One cycle of the Notion trigger:
    1. Query for actionable rows (Action Confirm = checked)
    2. Execute each action
    3. Update Notion with results
    """
    print("[TRIGGER] Querying Notion for actionable rows...")
    rows = query_actionable_rows()

    if not rows:
        print("[TRIGGER] No actionable rows found.")
        return {"processed": 0}

    print(f"[TRIGGER] Found {len(rows)} actionable row(s)")

    results = []
    for row in rows:
        page_id = row["notion_page_id"]
        try:
            updates = execute_action(row)
            update_notion_status(page_id, updates)

            # Log the action
            action = row["next_action"]
            if "error" in updates:
                append_notion_log(page_id, f"Action '{action}' failed: {updates['error']}")
                results.append({"page_id": page_id, "status": "error", "error": updates["error"]})
            else:
                append_notion_log(page_id, f"Action '{action}' completed successfully")
                results.append({"page_id": page_id, "status": "done"})

        except Exception as e:
            print(f"  [ERROR] {e}")
            try:
                update_notion_status(page_id, {"error": str(e)})
                append_notion_log(page_id, f"Error: {e}")
            except Exception:
                pass
            results.append({"page_id": page_id, "status": "error", "error": str(e)})

    done = sum(1 for r in results if r["status"] == "done")
    errors = sum(1 for r in results if r["status"] == "error")
    print(f"[TRIGGER] Cycle complete: {done} done, {errors} errors")

    return {"processed": len(results), "done": done, "errors": errors, "results": results}


def run_trigger_loop(interval_seconds=60):
    """Run the trigger in a continuous loop (like notion-trigger's cron)."""
    print(f"[TRIGGER] Starting loop (interval: {interval_seconds}s)")
    print(f"[TRIGGER] Database: {NOTION_DATABASE_ID[:8]}...")

    while True:
        try:
            run_trigger_cycle()
        except KeyboardInterrupt:
            print("\n[TRIGGER] Stopped by user")
            break
        except Exception as e:
            print(f"[TRIGGER] Cycle error: {e}")

        time.sleep(interval_seconds)


if __name__ == "__main__":
    import sys
    if "--loop" in sys.argv:
        interval = 60
        for arg in sys.argv:
            if arg.startswith("--interval="):
                interval = int(arg.split("=")[1])
        run_trigger_loop(interval)
    else:
        run_trigger_cycle()
