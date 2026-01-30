from typing import Optional
import math
from .mapping import map_properties
from .page_template import build_page_content


FORWARD_STAGES = [
    "applied",
    "received",
    "interview_scheduled",
    "interviewed",
    "final_round",
    "offer",
]
TERMINAL = {"rejected", "withdrawn"}


def choose_thread_key(row) -> Optional[str]:
    for key in ("conversation_id", "message_id"):
        val = row.get(key)
        if val is not None and not (isinstance(val, float) and math.isnan(val)) and str(val) != "":
            return val
    return None


def _norm_stage(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, dict):
        value = str(value)
    return str(value).strip().lower() or None


def allowed_stage_update(current: Optional[str], candidate: Optional[str]) -> bool:
    current = _norm_stage(current)
    candidate = _norm_stage(candidate)
    if not candidate:
        return True
    if current in TERMINAL:
        return False
    if current not in FORWARD_STAGES or candidate not in FORWARD_STAGES:
        return True
    return FORWARD_STAGES.index(candidate) >= FORWARD_STAGES.index(current)


def sync_row(row, client, database_id: str):
    thread_key = choose_thread_key(row)
    if not thread_key:
        return "ERROR", None, "missing thread key"

    props = map_properties(row)
    props["Action Confirm"] = False
    content = build_page_content(row)

    page_id = row.get("notion_page_id")
    if page_id is not None and not (isinstance(page_id, float) and math.isnan(page_id)) and str(page_id) != "":
        current_props = client.get_page_properties(page_id)
        current_stage = current_props.get("Stage")
        candidate_stage = props.get("Stage")
        if not allowed_stage_update(current_stage, candidate_stage):
            props.pop("Stage", None)
        props["Status Updated"] = True
        append_content = content
        try:
            page_text = client.get_page_plaintext(page_id)
            body_text = (row.get("body") or "").strip()
            if body_text and body_text in (page_text or ""):
                append_content = None
        except Exception:
            append_content = content
        client.update_page(page_id, props, content_append=append_content)
        return "DONE", page_id, None

    found = client.query_by_conversation_id(thread_key)
    if len(found) == 0:
        page_id = client.create_page(props, content)
        return "DONE", page_id, None
    if len(found) == 1:
        page_id = found[0]["id"]
        current_stage = found[0].get("properties", {}).get("Stage")
        if not allowed_stage_update(current_stage, props.get("Stage")):
            props.pop("Stage", None)
        props["Status Updated"] = True
        append_content = content
        try:
            page_text = client.get_page_plaintext(page_id)
            body_text = (row.get("body") or "").strip()
            if body_text and body_text in (page_text or ""):
                append_content = None
        except Exception:
            append_content = content
        client.update_page(page_id, props, content_append=append_content)
        return "DONE", page_id, None
    return "ERROR", None, f"multiple pages found for {thread_key}"
