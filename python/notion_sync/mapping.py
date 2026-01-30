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
        props[prop] = val
    thread_key = row.get("conversation_id") or row.get("message_id")
    if thread_key:
        props.setdefault("Conversation ID", thread_key)
    name_val = row.get("subject") or thread_key or row.get("company")
    if name_val:
        props.setdefault("Name", name_val)
    if "Email Link" not in props and row.get("web_link") not in (None, ""):
        props["Email Link"] = row.get("web_link")
    return props
