import pandas as pd

def schema_converter(df):
    
    for c in [
        "row_id","message_id","conversation_id","web_link","received_utc","from","subject",
        "company","body","kw_hits","llm_status","llm_processed_utc","error_msg",
        "notion_page_id","stage","priority","next_action","summary"
    ]:
        df[c] = df[c].astype("string")

    df["importance_score"] = pd.to_numeric(df["importance_score"], errors="coerce").astype("Float64")
    return df