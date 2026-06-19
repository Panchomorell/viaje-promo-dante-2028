import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileUp,
  Filter,
  Search,
  Sparkles,
  Users,
  XCircle
} from "lucide-react";
import "./styles.css";

const STUDENT_SOURCE = "/data/students.json";
const RESPONSE_SOURCE = "/data/respuestas_form.csv";

const statusMeta = {
  confirmed: { label: "Viaja", color: "#16825d", Icon: CheckCircle2 },
  declined: { label: "No viaja", color: "#c2412f", Icon: XCircle },
  pending: { label: "Falta confirmar", color: "#b7791f", Icon: AlertCircle }
};

const specialRules = [
  { key: "discount", label: "Cupo/descuento", pattern: /descuento|beca|cupo|bonific|ayuda|cuota|pago/i },
  { key: "free", label: "Liberado", pattern: /liberad|liberaci[oó]n|gratis|sin cargo/i },
  { key: "siblings", label: "Mellizos/gemelos", pattern: /melliz|gemel|herman/i }
];

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalName(value) {
  const raw = String(value || "");
  if (!raw.includes(",")) return normalize(raw);
  const [last, first] = raw.split(",").map((part) => normalize(part));
  return `${first} ${last}`.trim();
}

function detectDelimiter(line) {
  const semicolon = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  const tab = (line.match(/\t/g) || []).length;
  if (tab > semicolon && tab > comma) return "\t";
  return semicolon >= comma ? ";" : ",";
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const delimiter = detectDelimiter(firstLine);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);

  const headers = rows.shift()?.map((header) => normalize(header)) || [];
  return rows.map((cells) =>
    headers.reduce((item, header, index) => {
      item[header] = cells[index] || "";
      return item;
    }, {})
  );
}

function pickField(row, candidates) {
  const entries = Object.entries(row);
  const exact = candidates.map(normalize);
  const exactHit = exact.find((name) => row[name]);
  if (exactHit) return row[exactHit];
  const fuzzyHit = entries.find(([key]) => exact.some((candidate) => key.includes(candidate)));
  return fuzzyHit?.[1] || "";
}

function detectStatus(row) {
  const raw = normalize(
    pickField(row, [
      "viaja",
      "confirmacion",
      "confirma",
      "respuesta",
      "asiste",
      "estado",
      "viaje de egresados"
    ])
  );
  const combined = normalize(Object.values(row).join(" "));
  const source = raw || combined;

  if (/\b(no|no viaja|rechaza|declina|no confirma)\b/.test(source)) return "declined";
  if (/\b(si|sí|viaja|confirmo|confirma|acepta|voy)\b/.test(source)) return "confirmed";
  return "pending";
}

function extractResponse(row) {
  const name = pickField(row, ["alumno", "nombre", "estudiante", "apellido", "nombre y apellido"]);
  const observations = pickField(row, [
    "observaciones",
    "observacion",
    "comentarios",
    "comentario",
    "solicitud",
    "aclaraciones",
    "detalle"
  ]);
  const allText = Object.values(row).join(" ");

  return {
    name,
    canonical: canonicalName(name),
    status: detectStatus(row),
    observations: observations || "",
    rawText: allText,
    flags: specialRules.filter((rule) => rule.pattern.test(`${observations} ${allText}`)).map((rule) => rule.key)
  };
}

function mergeStudents(students, responses) {
  const responseByName = new Map();
  responses.forEach((response) => {
    if (response.canonical) responseByName.set(response.canonical, response);
  });

  return students.map((student) => {
    const response = responseByName.get(canonicalName(student.name));
    return {
      ...student,
      status: response?.status || "pending",
      observations: response?.observations || "",
      flags: response?.flags || [],
      responseName: response?.name || ""
    };
  });
}

function buildSummary(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      summary[row.status] += 1;
      if (row.flags.length) summary.special += 1;
      summary.courses[row.course] ||= { total: 0, confirmed: 0, declined: 0, pending: 0 };
      summary.courses[row.course].total += 1;
      summary.courses[row.course][row.status] += 1;
      return summary;
    },
    { total: 0, confirmed: 0, declined: 0, pending: 0, special: 0, courses: {} }
  );
}

function StatusPill({ status }) {
  const meta = statusMeta[status];
  const Icon = meta.Icon;
  return (
    <span className="status-pill" style={{ "--tone": meta.color }}>
      <Icon size={16} />
      {meta.label}
    </span>
  );
}

function MetricCard({ label, value, status, helper }) {
  const meta = status ? statusMeta[status] : null;
  return (
    <article className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color: meta?.color || "#172033" }}>
        {value}
      </div>
      <div className="metric-helper">{helper}</div>
    </article>
  );
}

function CourseBars({ courses }) {
  return (
    <section className="panel course-panel">
      <div className="panel-title">
        <Users size={20} />
        Estado por curso
      </div>
      <div className="course-bars">
        {Object.entries(courses).map(([course, data]) => (
          <div className="course-row" key={course}>
            <div className="course-heading">
              <strong>{course}</strong>
              <span>{data.total} alumnos</span>
            </div>
            <div className="stacked-bar" aria-label={`Estado ${course}`}>
              {["confirmed", "declined", "pending"].map((status) => (
                <span
                  key={status}
                  style={{
                    width: `${(data[status] / data.total) * 100}%`,
                    background: statusMeta[status].color
                  }}
                  title={`${statusMeta[status].label}: ${data[status]}`}
                />
              ))}
            </div>
            <div className="bar-legend">
              <span>Viaja {data.confirmed}</span>
              <span>No {data.declined}</span>
              <span>Pend. {data.pending}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StudentRow({ student }) {
  const specialLabels = specialRules.filter((rule) => student.flags.includes(rule.key));
  return (
    <article className="student-row">
      <div className="student-main">
        <div className="student-order">{student.course}-{student.order}</div>
        <div>
          <h3>{student.name}</h3>
          {student.responseName && student.responseName !== student.name && (
            <p>Respuesta: {student.responseName}</p>
          )}
        </div>
      </div>
      <div className="student-side">
        <StatusPill status={student.status} />
        {specialLabels.length > 0 && (
          <div className="flag-list">
            {specialLabels.map((rule) => (
              <span key={rule.key}>
                <Sparkles size={14} />
                {rule.label}
              </span>
            ))}
          </div>
        )}
        {student.observations && <p className="observation">{student.observations}</p>}
      </div>
    </article>
  );
}

function App() {
  const [students, setStudents] = useState([]);
  const [responses, setResponses] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [specialOnly, setSpecialOnly] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("Sin respuestas cargadas");

  useEffect(() => {
    fetch(STUDENT_SOURCE).then((response) => response.json()).then(setStudents);
    const saved = localStorage.getItem("promoDanteResponsesCsv");
    if (saved) {
      setResponses(parseCsv(saved).map(extractResponse));
      setSourceLabel("Respuestas cargadas desde este navegador");
      return;
    }
    fetch(RESPONSE_SOURCE)
      .then((response) => {
        if (!response.ok) throw new Error("No responses");
        return response.text();
      })
      .then((text) => {
        setResponses(parseCsv(text).map(extractResponse));
        setSourceLabel("Respuestas leidas desde /data/respuestas_form.csv");
      })
      .catch(() => setSourceLabel("Carga el CSV exportado del Form para comparar"));
  }, []);

  const rows = useMemo(() => mergeStudents(students, responses), [students, responses]);
  const summary = useMemo(() => buildSummary(rows), [rows]);
  const visibleRows = useMemo(() => {
    const needle = normalize(query);
    return rows.filter((row) => {
      const matchesQuery = normalize(`${row.name} ${row.observations}`).includes(needle);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesCourse = courseFilter === "all" || row.course === courseFilter;
      const matchesSpecial = !specialOnly || row.flags.length > 0;
      return matchesQuery && matchesStatus && matchesCourse && matchesSpecial;
    });
  }, [rows, query, statusFilter, courseFilter, specialOnly]);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    localStorage.setItem("promoDanteResponsesCsv", text);
    setResponses(parseCsv(text).map(extractResponse));
    setSourceLabel(file.name);
  }

  function exportView() {
    const lines = ["Curso,Orden,Alumno,Estado,Observaciones"];
    visibleRows.forEach((row) => {
      lines.push(
        [row.course, row.order, row.name, statusMeta[row.status].label, row.observations]
          .map((value) => `"${String(value || "").replace(/"/g, '""')}"`)
          .join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "seguimiento-promo-dante-2028.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Viaje de Egresados · Promo Dante 2028</p>
          <h1>Seguimiento de confirmaciones 4to A y 4to B</h1>
          <p>
            Panel para cruzar la nomina oficial con las respuestas del Form:
            quien viaja, quien no, quien falta y que casos requieren revision especial.
          </p>
        </div>
        <label className="upload-box">
          <FileUp size={26} />
          <span>Cargar CSV de respuestas</span>
          <small>{sourceLabel}</small>
          <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={handleFile} />
        </label>
      </header>

      <main className="main-grid">
        <section className="metrics-grid">
          <MetricCard label="Total nomina" value={summary.total} helper="Alumnos de 4A y 4B" />
          <MetricCard label="Confirmaron" value={summary.confirmed} status="confirmed" helper="Marcados como viajan" />
          <MetricCard label="No viajan" value={summary.declined} status="declined" helper="Respuestas negativas" />
          <MetricCard label="Faltan" value={summary.pending} status="pending" helper="Sin respuesta o indeterminado" />
          <MetricCard label="Con observacion" value={summary.special} helper="Descuento, liberado o hermanos" />
        </section>

        <CourseBars courses={summary.courses} />

        <section className="panel controls-panel">
          <div className="search-control">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar alumno u observacion"
            />
          </div>
          <div className="select-group">
            <Filter size={18} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todos los estados</option>
              <option value="confirmed">Viaja</option>
              <option value="declined">No viaja</option>
              <option value="pending">Falta confirmar</option>
            </select>
            <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
              <option value="all">4A y 4B</option>
              <option value="4A">4A</option>
              <option value="4B">4B</option>
            </select>
            <button type="button" className={specialOnly ? "active" : ""} onClick={() => setSpecialOnly((value) => !value)}>
              <Sparkles size={16} />
              Observaciones
            </button>
            <button type="button" onClick={exportView}>
              <Download size={16} />
              Exportar vista
            </button>
          </div>
        </section>

        <section className="student-list">
          {visibleRows.map((student) => (
            <StudentRow key={`${student.course}-${student.order}-${student.name}`} student={student} />
          ))}
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
