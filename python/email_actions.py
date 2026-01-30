"""
Email Actions — bridge to job-auto-apply Node.js CLI.

Executes email operations (add contact, schedule, send) by calling
the job-auto-apply CLI as a subprocess.
"""

import subprocess
import json
import os
from pathlib import Path

# Path to job-auto-apply project
JOB_APPLY_DIR = os.getenv("JOB_APPLY_DIR", str(Path(__file__).parent.parent))
NODE_BIN = os.getenv("NODE_BIN", "node")
CLI_ENTRY = os.path.join(JOB_APPLY_DIR, "src", "index.js")


def _run_cli(*args, timeout=30):
    """Run job-auto-apply CLI command and return output."""
    cmd = [NODE_BIN, CLI_ENTRY] + list(args)
    try:
        result = subprocess.run(
            cmd,
            cwd=JOB_APPLY_DIR,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "success": result.returncode == 0,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "stdout": "", "stderr": "Command timed out"}
    except FileNotFoundError:
        return {"success": False, "stdout": "", "stderr": f"CLI not found at {CLI_ENTRY}"}


def add_company(name, industry="", priority=5):
    """Add a company to job-auto-apply database."""
    args = ["add-company", "-n", name]
    if industry:
        args += ["-i", industry]
    args += ["-p", str(priority)]
    return _run_cli(*args)


def add_contact(email_addr, name, company, first_name="", title="", source="notion"):
    """Add a contact to job-auto-apply database."""
    args = ["add-contact", "-e", email_addr, "-n", name, "-c", company]
    if first_name:
        args += ["-f", first_name]
    if title:
        args += ["--title", title]
    args += ["--source", source]
    return _run_cli(*args)


def schedule_email(contact_id, template="cold_general", template_data=None):
    """Schedule an email for a contact."""
    args = ["schedule", "-c", str(contact_id), "-t", template]
    if template_data:
        args += ["-d", json.dumps(template_data)]
    return _run_cli(*args)


def send_emails(dry_run=False):
    """Send all scheduled emails."""
    args = ["send"]
    if dry_run:
        args.append("--dry-run")
    return _run_cli(*args, timeout=120)


def queue_followups():
    """Auto-schedule followup emails for contacts."""
    return _run_cli("queue")


def check_replies():
    """Check inbox for replies from contacted companies."""
    return _run_cli("check-replies")


def get_status():
    """Get current system status (counts, daily stats)."""
    return _run_cli("status")


def list_contacts(status=None):
    """List contacts, optionally filtered by status."""
    args = ["list"]
    if status:
        args += ["-s", status]
    return _run_cli(*args)


def mark_replied(contact_id):
    """Mark a contact as replied."""
    return _run_cli("replied", str(contact_id))


def mark_not_interested(contact_id):
    """Mark a contact as not interested."""
    return _run_cli("not-interested", str(contact_id))


def verify_connection():
    """Verify SMTP/IMAP connection."""
    return _run_cli("verify")


def get_inbox(count=10, query=None):
    """Read inbox messages."""
    args = ["inbox", "-n", str(count)]
    if query:
        args += ["-q", query]
    return _run_cli(*args)


# --- High-level composite actions ---

def send_cold_email(email_addr, name, company, template="cold_general", template_data=None, dry_run=False):
    """
    Full flow: add company → add contact → schedule → send.
    Returns a summary dict.
    """
    results = {"steps": []}

    # 1. Add company
    r = add_company(company)
    results["steps"].append({"action": "add_company", **r})

    # 2. Add contact
    r = add_contact(email_addr, name, company)
    results["steps"].append({"action": "add_contact", **r})
    if not r["success"]:
        results["error"] = f"Failed to add contact: {r['stderr']}"
        return results

    # 3. Extract contact ID from output
    contact_id = None
    output = r["stdout"]
    # Try to parse "Contact added with ID: X"
    for line in output.split("\n"):
        if "id" in line.lower():
            import re
            match = re.search(r"(\d+)", line)
            if match:
                contact_id = match.group(1)
                break

    if not contact_id:
        results["error"] = "Could not determine contact ID"
        return results

    # 4. Schedule email
    r = schedule_email(contact_id, template, template_data)
    results["steps"].append({"action": "schedule", **r})

    # 5. Send
    r = send_emails(dry_run=dry_run)
    results["steps"].append({"action": "send", **r})

    results["success"] = all(s.get("success") for s in results["steps"])
    results["contact_id"] = contact_id
    return results
