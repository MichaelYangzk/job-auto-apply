from typing import Dict, Any
import math

PROPERTY_MAP = {
    "conversation_id": "Conversation ID",
    "message_id": "Message ID",
    "email_link": "Email Link",
    "from": "From",
    "company": "Company",
    "subject": "Subject",
    "received_utc": "Received UTC",
    "stage": "Stage",
    "priority": "Priority",
    "importance_score": "Importance Score",
    "next_action": "Next Action",
    "summary": "Summary",
    "llm_status": "LLM Status",
    "error_msg": "Error",
    "due_date": "Due date",
}

EFFORT_MAP = {
    "complete_assessment": "High",
    "submit_materials": "High",
    "sign_offer": "High",
    "schedule": "Medium",
    "reply": "Medium",
    "escalate": "Medium",
    "follow_up": "Low",
    "archive": "Low",
    "ignore": "Low",
}

TASK_TYPE_MAP = {
    "reply": "Reply",
    "schedule": "Schedule",
    "submit_materials": "Submit Materials",
    "complete_assessment": "Assessment",
    "sign_offer": "Sign Offer",
    "follow_up": "Follow Up",
    "archive": "Archive",
    "ignore": "Ignore",
    "escalate": "Escalate",
}


def map_properties(row) -> Dict[str, Any]:
    props = {}
    for col, prop in PROPERTY_MAP.items():
        if col not in row:
            continue
        val = row[col]
        if val is None:
            continue
        if isinstance(val, float) and math.isnan(val):
            continue
        if isinstance(val, str) and val.strip() == "":
            continue
        props[prop] = val
    thread_key = row.get("conversation_id") or row.get("message_id")
    if thread_key:
        props.setdefault("Conversation ID", thread_key)
    name_val = row.get("subject") or thread_key or row.get("company")
    if name_val:
        props.setdefault("Name", name_val)

    # Email Link: prefer explicit link, fall back to Gmail search link
    if "Email Link" not in props:
        web_link = row.get("web_link")
        if web_link and str(web_link).strip():
            props["Email Link"] = str(web_link).strip()
        else:
            msg_id = row.get("message_id", "")
            if msg_id:
                clean_id = str(msg_id).strip("<>")
                if clean_id:
                    props["Email Link"] = f"https://mail.google.com/mail/u/0/#search/rfc822msgid:{clean_id}"

    # Description = summary
    summary = props.get("Summary") or row.get("summary")
    if summary and str(summary).strip():
        props.setdefault("Description", str(summary).strip())

    # Effort level from next_action
    na = row.get("next_action")
    if na and str(na).strip():
        effort = EFFORT_MAP.get(str(na).strip().lower())
        if effort:
            props.setdefault("Effort level", effort)

    # Task type from next_action
    if na and str(na).strip():
        task = TASK_TYPE_MAP.get(str(na).strip().lower())
        if task:
            props.setdefault("Task type", [task])

    return props
