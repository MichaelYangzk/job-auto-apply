"""
Email ↔ Notion — Bidirectional Orchestrator

Two directions:
  PUSH (Email → Notion):  Gmail IMAP → LLM classification → Notion database
  PULL (Notion → Email):  Notion action commands → job-auto-apply email engine

Usage:
  python main.py                  # Run full bidirectional cycle
  python main.py push             # Email → Notion only
  python main.py pull             # Notion → Email only
  python main.py loop             # Continuous bidirectional loop
  python main.py loop --interval=120
  python main.py excel            # Original Excel-based flow
"""

import sys
import time
import pandas as pd
from datetime import datetime, timezone

from schema_converter import schema_converter
from LLM import build_prompt, call_llm_structured
from notion_sync.runner import sync_excel_rows, sync_dict_rows
from notion_sync.excel_io import write_back_excel
from gmail_source import fetch_recent, fetch_from_contacts
from notion_trigger import run_trigger_cycle

# Legacy Excel source
from local_copy_manager import copy_and_merge_to_local, get_local_copy_path

ONEDRIVE_XLSX = "/Users/cm/Library/CloudStorage/OneDrive-UCIrvine/Jobs.xlsx"
LOCAL_XLSX = get_local_copy_path(ONEDRIVE_XLSX)


# --- LLM Classification ---

def classify_rows(rows):
    """Run LLM classification on a list of dict rows. Returns classified rows."""
    classified = []
    for i, row in enumerate(rows):
        if row.get("llm_status", "").upper() not in ("", "NEW"):
            classified.append(row)
            continue

        try:
            prompt = build_prompt(
                from_=row.get("from", ""),
                subject=row.get("subject", ""),
                company=row.get("company", ""),
                received_utc=row.get("received_utc", ""),
                body=row.get("body", ""),
            )

            llm_output = call_llm_structured(prompt)

            allowed_next_action = {
                "reply", "schedule", "submit_materials", "complete_assessment",
                "sign_offer", "follow_up", "archive", "ignore", "escalate",
            }
            if llm_output.get("next_action") not in allowed_next_action:
                raise ValueError(f"next_action invalid: {llm_output.get('next_action')}")

            row_copy = dict(row)
            for k, v in llm_output.items():
                row_copy[k] = v
            row_copy["llm_status"] = "DONE"
            row_copy["llm_processed_utc"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
            row_copy["error_msg"] = ""
            classified.append(row_copy)

            print(f"  [{i+1}] {row.get('company', '?')} → stage={llm_output.get('stage')}, action={llm_output.get('next_action')}")

        except Exception as e:
            row_copy = dict(row)
            row_copy["llm_status"] = "ERROR"
            row_copy["llm_processed_utc"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
            row_copy["error_msg"] = str(e)
            classified.append(row_copy)
            print(f"  [{i+1}] {row.get('company', '?')} → ERROR: {e}")

    return classified


# --- PUSH: Email → Notion ---

def run_push(days=7, limit=50):
    """
    PUSH direction: Gmail → LLM → Notion

    1. Fetch recent emails from Gmail IMAP
    2. Classify with LLM
    3. Sync to Notion database
    """
    print("[PUSH] Fetching emails from Gmail IMAP...")
    rows = fetch_recent(days=days, limit=limit)

    if not rows:
        print("[PUSH] No new emails found.")
        return None

    print(f"[PUSH] Found {len(rows)} email(s)")

    print("[PUSH] Running LLM classification...")
    classified = classify_rows(rows)
    done = sum(1 for r in classified if r.get("llm_status") == "DONE")
    errors = sum(1 for r in classified if r.get("llm_status") == "ERROR")
    print(f"[PUSH] LLM done: {done} classified, {errors} errors")

    print("[PUSH] Syncing to Notion...")
    results = sync_dict_rows(classified, debug=True)
    synced = sum(1 for r in results if r.get("llm_status") == "DONE")
    print(f"[PUSH] Notion sync done: {synced} synced")

    return results


# --- PULL: Notion → Email ---

def run_pull():
    """
    PULL direction: Notion → job-auto-apply

    1. Query Notion for rows with "Action Confirm" checked
    2. Execute the specified action (send, followup, archive, etc.)
    3. Update Notion with results
    """
    print("[PULL] Running Notion trigger cycle...")
    result = run_trigger_cycle()
    return result


# --- BIDIRECTIONAL ---

def run_full():
    """Run both directions: PUSH then PULL."""
    print("=" * 55)
    print("  Email ↔ Notion — Bidirectional Sync")
    print("=" * 55)
    print()

    # Direction 1: Email → Notion
    push_result = run_push()

    print()

    # Direction 2: Notion → Email
    pull_result = run_pull()

    print()
    print("[DONE] Bidirectional cycle complete.")
    return {"push": push_result, "pull": pull_result}


def run_loop(interval=120):
    """Run bidirectional sync in a continuous loop."""
    print(f"[LOOP] Starting bidirectional loop (interval: {interval}s)")
    print(f"[LOOP] Press Ctrl+C to stop")

    cycle = 0
    while True:
        cycle += 1
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"\n{'─' * 55}")
        print(f"  Cycle {cycle} @ {ts}")
        print(f"{'─' * 55}")

        try:
            run_full()
        except KeyboardInterrupt:
            print("\n[LOOP] Stopped by user")
            break
        except Exception as e:
            print(f"[LOOP] Cycle error: {e}")

        time.sleep(interval)


# --- LEGACY: Excel-based flow ---

def run_llm_excel(path: str):
    """Original Excel-based LLM classification."""
    df = pd.read_excel(path)
    df = schema_converter(df)
    status_col = df["llm_status"].fillna("").astype(str).str.strip().str.upper()
    mask = (status_col == "NEW") | (status_col == "")
    indices = df[mask].index.tolist()

    for i in indices:
        try:
            row = df.loc[i].fillna("")
            prompt = build_prompt(
                from_=row["from"],
                subject=row["subject"],
                company=row["company"],
                received_utc=row["received_utc"],
                body=row["body"],
            )
            llm_output = call_llm_structured(prompt)

            allowed_next_action = {
                "reply", "schedule", "submit_materials", "complete_assessment",
                "sign_offer", "follow_up", "archive", "ignore", "escalate",
            }
            if llm_output.get("next_action") not in allowed_next_action:
                raise ValueError(f"next_action invalid: {llm_output.get('next_action')}")

            for k, v in llm_output.items():
                df.at[i, k] = v
            df.at[i, "llm_status"] = "DONE"
            df.at[i, "llm_processed_utc"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
            df.at[i, "error_msg"] = ""
        except Exception as e:
            df.at[i, "llm_status"] = "ERROR"
            df.at[i, "llm_processed_utc"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
            df.at[i, "error_msg"] = str(e)

    write_back_excel(df, path)
    return df


def run_excel(onedrive_path: str = ONEDRIVE_XLSX, force_refresh: bool = False):
    """Original Excel-based full pipeline (legacy)."""
    print("[STEP 1] Copy from OneDrive and merge...")
    local_path, stats = copy_and_merge_to_local(onedrive_path, force_refresh=force_refresh)
    added = stats.get("added", 0)
    kept = stats.get("kept", 0)
    pending = stats.get("pending", 0)
    print(f"[AUDIT] added={added}, kept={kept}, pending={pending}")

    if added == 0 and kept == 0 and pending == 0:
        print("[STOP] No changes detected. Abort.")
        return None

    if pending == 0:
        print("[STOP] Changes detected but no pending rows. LLM/Notion skipped.")
        return None

    print("[STEP 2] LLM start")
    df_llm = run_llm_excel(local_path)
    print("[STEP 2] LLM done")

    print("[STEP 3] Notion sync start")
    df_sync = sync_excel_rows(local_path, debug=True)
    print("[STEP 3] Notion sync done")

    print(f"[DONE] Local file: {local_path}")
    return df_sync


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "full"

    if cmd == "push":
        run_push()
    elif cmd == "pull":
        run_pull()
    elif cmd == "loop":
        interval = 120
        for arg in sys.argv[2:]:
            if arg.startswith("--interval="):
                interval = int(arg.split("=")[1])
        run_loop(interval)
    elif cmd == "excel":
        run_excel()
    else:
        run_full()
