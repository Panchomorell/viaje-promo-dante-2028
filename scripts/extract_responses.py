import json
import sys
import unicodedata
from pathlib import Path

import pandas as pd


def normalize_words(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = "".join(char.lower() if char.isalnum() else " " for char in text)
    return text.split()


def column_lookup(columns, *candidates):
    exact = {" ".join(normalize_words(column)): column for column in columns}
    for candidate in candidates:
        key = " ".join(normalize_words(candidate))
        if key in exact:
            return exact[key]

    candidate_tokens = [set(normalize_words(candidate)) for candidate in candidates]
    for column in columns:
        tokens = set(normalize_words(column))
        if any(candidate and candidate.issubset(tokens) for candidate in candidate_tokens):
            return column
    return None


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
    if source.suffix.lower() == ".csv":
        df = pd.read_csv(source)
    else:
        df = pd.read_excel(source)
    columns = list(df.columns)

    timestamp_col = column_lookup(columns, "Marca temporal", "timestamp", "fecha")
    first_name_col = column_lookup(columns, "Nombre del alumno")
    last_name_col = column_lookup(columns, "Apellido del alumno")
    dni_col = column_lookup(columns, "DNI del alumno", "dni")
    course_col = column_lookup(columns, "Curso")
    confirmation_col = column_lookup(columns, "Mi hijo participara del viaje de egresados", "confirmacion", "viaja")
    guardian_col = column_lookup(columns, "Apellido y nombre del padre madre o responsable", "responsable")
    phone_col = column_lookup(columns, "Telefono de contacto", "telefono", "celular")
    email_col = column_lookup(columns, "Correo electronico de contacto", "email", "mail")
    observations_col = column_lookup(columns, "Comentarios Observaciones", "observaciones", "comentarios")

    rows = []
    for _, row in df.iterrows():
        first_name = clean(row.get(first_name_col))
        last_name = clean(row.get(last_name_col))
        name = f"{first_name} {last_name}".strip()
        if not name:
            continue

        rows.append(
            {
                "timestamp": clean(row.get(timestamp_col)),
                "firstName": first_name,
                "lastName": last_name,
                "name": name,
                "dni": clean(row.get(dni_col)),
                "course": clean(row.get(course_col)),
                "confirmation": clean(row.get(confirmation_col)),
                "guardian": clean(row.get(guardian_col)),
                "phone": clean(row.get(phone_col)),
                "email": clean(row.get(email_col)),
                "observations": clean(row.get(observations_col)),
            }
        )

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} responses to {target}")


if __name__ == "__main__":
    main()
