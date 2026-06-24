import json
import re
import sys
import unicodedata
from pathlib import Path


def normalize(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = text.encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", " ", text).strip()


def response_key(row):
    first = normalize(row.get("firstName")).split(" ")[0] if normalize(row.get("firstName")) else ""
    last = normalize(row.get("lastName"))
    key = f"{first} {last}".strip()
    return key or normalize(row.get("name"))


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: merge_responses.py <current.json> <new.json>")

    current_path = Path(sys.argv[1])
    new_path = Path(sys.argv[2])
    current_rows = json.loads(current_path.read_text(encoding="utf-8"))
    new_rows = json.loads(new_path.read_text(encoding="utf-8"))

    merged_by_key = {response_key(row): row for row in current_rows if response_key(row)}
    added = 0
    updated = 0

    for row in new_rows:
        key = response_key(row)
        if not key:
            continue
        if key in merged_by_key:
            updated += 1
        else:
            added += 1
        merged_by_key[key] = row

    merged_rows = list(merged_by_key.values())
    current_path.write_text(json.dumps(merged_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "before": len(current_rows),
                "new_file": len(new_rows),
                "after": len(merged_rows),
                "added": added,
                "updated": updated,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
