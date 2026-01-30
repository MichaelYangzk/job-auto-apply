from typing import Optional, List, Dict, Any
from .excel_io import read_excel, write_back_excel, iter_rows_for_sync
from .idempotency import sync_row
from .notion_client import HttpNotionClient, NotionClient, PROPERTY_TYPES
from .config import NOTION_TOKEN, NOTION_DATABASE_ID
from .mapping import PROPERTY_MAP


def _get_client(client=None, database_id=None, query_properties=None, debug=False):
    """Create or reuse a NotionClient."""
    return client or HttpNotionClient(
        token=NOTION_TOKEN,
        database_id=database_id or NOTION_DATABASE_ID,
        query_properties=query_properties or ["Conversation ID", "Identity", "Name", "Message ID"],
        debug=debug,
    )


def sync_excel_rows(excel_path: str, client: Optional[NotionClient] = None, database_id: Optional[str] = None, out_path: Optional[str] = None, query_property: str = "Conversation ID", query_properties: Optional[list] = None, debug: bool = False):
    client = _get_client(client, database_id, query_properties or [query_property, "Identity", "Name", "Message ID"], debug)
    db_id = database_id or NOTION_DATABASE_ID

    required_types = {k: PROPERTY_TYPES.get(k, "rich_text") for k in PROPERTY_TYPES.keys()}
    client.ensure_properties(required_types)

    df = read_excel(excel_path)
    for idx, row in iter_rows_for_sync(df):
        try:
            status, page_id, error = sync_row(row, client, db_id)
        except Exception as e:
            import traceback
            print(f"Row {idx} error: {e}")
            traceback.print_exc()
            status, page_id, error = "ERROR", None, str(e)
        if page_id:
            df.at[idx, "notion_page_id"] = page_id
        df.at[idx, "llm_status"] = status
        df.at[idx, "error_msg"] = error

    write_back_excel(df, out_path or excel_path)
    return df


def sync_dict_rows(rows: List[Dict[str, Any]], client: Optional[NotionClient] = None, database_id: Optional[str] = None, debug: bool = False) -> List[Dict[str, Any]]:
    """
    Sync a list of dict rows (from Gmail IMAP) to Notion.
    Each row dict should have keys matching the schema:
    message_id, conversation_id, from, subject, company, body, etc.

    Returns the rows with updated notion_page_id and llm_status.
    """
    client = _get_client(client, database_id, debug=debug)
    db_id = database_id or NOTION_DATABASE_ID

    required_types = {k: PROPERTY_TYPES.get(k, "rich_text") for k in PROPERTY_TYPES.keys()}
    client.ensure_properties(required_types)

    results = []
    for i, row in enumerate(rows):
        try:
            status, page_id, error = sync_row(row, client, db_id)
        except Exception as e:
            import traceback
            print(f"Row {i} error: {e}")
            traceback.print_exc()
            status, page_id, error = "ERROR", None, str(e)

        row_copy = dict(row)
        if page_id:
            row_copy["notion_page_id"] = page_id
        row_copy["llm_status"] = status
        row_copy["error_msg"] = error
        results.append(row_copy)

    return results
