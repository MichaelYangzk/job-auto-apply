import os
import shutil
import pandas as pd
from pathlib import Path


def get_local_copy_path(source_path: str) -> str:
    return os.path.join(os.getcwd(), "Jobs.xlsx")


def sanitize_body_column(df: pd.DataFrame) -> pd.DataFrame:
    if "body" not in df.columns:
        return df

    def _clean(val):
        if pd.isna(val):
            return val
        text = str(val)
        text = text.replace("_x000D_", "")
        text = text.replace("_x000A_", "\n")
        while "\n\n\n" in text:
            text = text.replace("\n\n\n", "\n\n")
        return text.strip()

    df = df.copy()
    df["body"] = df["body"].apply(_clean)
    return df


def merge_dataframes_smart(onedrive_df: pd.DataFrame, local_df: pd.DataFrame):
    stats = {"added": 0, "kept": 0}

    if local_df is None or local_df.empty:
        return onedrive_df.copy(), {"added": len(onedrive_df), "kept": 0}

    if "message_id" not in onedrive_df.columns or "message_id" not in local_df.columns:
        return onedrive_df.copy(), {"added": len(onedrive_df), "kept": 0}

    def _norm_msg_id(series: pd.Series) -> pd.Series:
        return series.astype(str).str.strip()

    def _is_new(series: pd.Series) -> pd.Series:
        return series.fillna("").astype(str).str.strip().str.upper() == "NEW"

    onedrive = onedrive_df.copy()
    local = local_df.copy()

    onedrive["_msg_key"] = _norm_msg_id(onedrive["message_id"])
    local["_msg_key"] = _norm_msg_id(local["message_id"])

    local_nonempty = local[local["_msg_key"] != ""].copy()
    onedrive_new = onedrive[~onedrive["_msg_key"].isin(local_nonempty["_msg_key"])]

    merged = pd.concat([
        local_nonempty.drop(columns=["_msg_key"]),
        onedrive_new.drop(columns=["_msg_key"]),
    ], ignore_index=True)

    merged = merged.drop_duplicates(subset=["message_id"], keep="first")

    stats["kept"] = len(local_nonempty)
    stats["added"] = len(onedrive_new)

    return merged, stats


def copy_and_merge_to_local(source_path: str, force_refresh: bool = False):
    local_path = get_local_copy_path(source_path)
    
    print(f"Source: {source_path}")
    print(f"Target: {local_path}")
    
    if not os.path.exists(source_path):
        raise FileNotFoundError(f"Source file not found: {source_path}")
    
    print("Reading OneDrive file...")
    onedrive_df = pd.read_excel(source_path, dtype=object)
    
    if os.path.exists(local_path) and not force_refresh:
        print("Local copy exists, performing smart merge...")
        try:
            local_df = pd.read_excel(local_path, dtype=object)
            merged_df, stats = merge_dataframes_smart(onedrive_df, local_df)
        except Exception as e:
            print(f"[WARNING] Failed to merge with local copy: {e}")
            print(f"[WARNING] Using OneDrive data as-is")
            merged_df = onedrive_df
            stats = {"added": len(onedrive_df), "kept": 0}
    else:
        if force_refresh:
            print("Force refresh enabled, using OneDrive data as-is")
        else:
            print("No local copy found, creating new one")
        merged_df = onedrive_df
        stats = {"added": len(onedrive_df), "kept": 0}
    
    merged_df = sanitize_body_column(merged_df)

    print("Writing to local copy...")
    merged_df.to_excel(local_path, index=False)
    print(f"Local copy created: {local_path}")
    
    pending_mask = merged_df.get("llm_status", pd.Series([], dtype=object)).fillna("").astype(str).str.strip().str.upper().isin(["", "NEW"])
    stats["pending"] = int(pending_mask.sum())

    return local_path, stats


def main():
    source = "/Users/cm/Library/CloudStorage/OneDrive-UCIrvine/Jobs.xlsx"
    local = copy_and_merge_to_local(source)
    print(f"\n[SUCCESS] Local copy ready at: {local}")


if __name__ == "__main__":
    main()
