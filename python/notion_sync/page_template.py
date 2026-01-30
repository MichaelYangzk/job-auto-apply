from typing import Any


def build_page_content(row: Any) -> str:
    sender = row.get("from", "") or ""
    subject = row.get("subject", "") or ""
    body = row.get("body", "") or ""

    lines = [
        f"From: {sender}",
        f"Subject: {subject}",
        "",
        body,
    ]
    return "\n".join(lines)
