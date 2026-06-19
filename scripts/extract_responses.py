import json
import sys
from pathlib import Path

import pandas as pd


def clean(value):
    if pd.isna(value):
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_responses.py <input.xlsx> <output.json>")

    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    df = pd.read_excel(source)
    columns = {str(column).strip(): column for column in df.columns}

    rows = []
    for _, row in df.iterrows():
        first_name = clean(row.get(columns.get("Nombre del alumno")))
        last_name = clean(row.get(columns.get("Apellido del alumno")))
        name = f"{first_name} {last_name}".strip()
        if not name:
            continue

        rows.append(
            {
                "timestamp": clean(row.get(columns.get("Marca temporal"))),
                "firstName": first_name,
                "lastName": last_name,
                "name": name,
                "dni": clean(row.get(columns.get("DNI del alumno"))),
                "course": clean(row.get(columns.get("Curso"))),
                "confirmation": clean(row.get(columns.get("¿Mi hijo/a participará del viaje de egresados?"))),
                "guardian": clean(row.get(columns.get("Apellido y nombre del padre/madre o responsable"))),
                "phone": clean(row.get(columns.get("Teléfono de contacto"))),
                "email": clean(row.get(columns.get("Correo electrónico de contacto"))),
                "observations": clean(row.get(columns.get("Comentarios/Observaciones"))),
            }
        )

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} responses to {target}")


if __name__ == "__main__":
    main()
