import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import * as XLSX from "xlsx";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileUp,
  Filter,
  Mail,
  Phone,
  Search,
  Sparkles,
  UserRound,
  Users,
  X,
  XCircle
} from "lucide-react";
import "./styles.css";

const STUDENT_SOURCE = "/data/students.json";
const RESPONSE_SOURCE = "/data/responses.json";
const STORAGE_KEY = "promoDanteResponsesRows";
const SENSITIVE_PASSWORD = "DA2028";

const statusMeta = {
  confirmed: { label: "Viaja", color: "#16825d", Icon: CheckCircle2 },
  declined: { label: "No viaja", color: "#c2412f", Icon: XCircle },
  pending: { label: "Falta confirmar", color: "#b7791f", Icon: AlertCircle }
};

const specialRules = [
  { key: "discount", label: "Observaciones/Descuento", pattern: /descuento|beca|cupo|bonific|cuota|dificultad.*pago|facilidad.*pago|problema.*pago|posible.*ayuda|ayuda.*monto|ayuda.*solventar|gran esfuerzo.*solventar|solicito.*ayuda|ped.*ayuda|necesit.*ayuda|\d+%.*ayuda/i },
  { key: "free", label: "Liberado", pattern: /liberad|liberacion|liberación|gratis|sin cargo/i },
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

function clean(value) {
  const text = String(value ?? "").trim();
  return text.toLowerCase() === "nan" ? "" : text;
}

function matchesRule(rule, text) {
  return rule.pattern.test(text) || rule.pattern.test(normalize(text));
}

function splitStudentName(value) {
  const raw = clean(value);
  if (!raw.includes(",")) return { first: "", last: "", display: raw };
  const [last, first] = raw.split(",").map(clean);
  return { first, last, display: `${first} ${last}`.trim() };
}

function personKey({ first, last, name }) {
  const explicitFirst = normalize(first).split(" ")[0] || "";
  const explicitLast = normalize(last);
  if (explicitFirst && explicitLast) return `${explicitFirst} ${explicitLast}`;

  const raw = clean(name);
  if (raw.includes(",")) {
    const split = splitStudentName(raw);
    return personKey({ first: split.first, last: split.last });
  }
  return normalize(raw);
}

function firstToken(value) {
  return normalize(value).split(" ")[0] || "";
}

function nameVariants({ first, last, name }) {
  const raw = clean(name);
  const split = raw && raw.includes(",") ? splitStudentName(raw) : null;
  const firstValue = split?.first || first || "";
  const lastValue = split?.last || last || "";
  const firstPart = firstToken(firstValue);
  const lastFull = normalize(lastValue);
  const lastPart = firstToken(lastValue);
  const variants = new Set();

  if (firstPart && lastFull) variants.add(`${firstPart} ${lastFull}`);
  if (firstPart && lastPart) variants.add(`${firstPart} ${lastPart}`);
  if (lastPart && firstPart) variants.add(`${lastPart} ${firstPart}`);
  if (raw) variants.add(personKey({ first, last, name: raw }));

  return Array.from(variants).filter(Boolean);
}

function editDistance(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (left === right) return 0;
  const matrix = Array.from({ length: left.length + 1 }, (_, row) => [row]);
  for (let col = 1; col <= right.length; col += 1) matrix[0][col] = col;
  for (let row = 1; row <= left.length; row += 1) {
    for (let col = 1; col <= right.length; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }
  return matrix[left.length][right.length];
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

  const headers = rows.shift() || [];
  return rows.map((cells) =>
    headers.reduce((item, header, index) => {
      item[header] = cells[index] || "";
      return item;
    }, {})
  );
}

function pickField(row, candidates) {
  const entries = Object.entries(row);
  const normalizedCandidates = candidates.map(normalize);
  const exact = entries.find(([key, value]) => value && normalizedCandidates.includes(normalize(key)));
  if (exact) return exact[1];
  const fuzzy = entries.find(([key, value]) => value && normalizedCandidates.some((candidate) => normalize(key).includes(candidate)));
  return fuzzy?.[1] || "";
}

function detectStatus(row) {
  const field = pickField(row, [
    "confirmation",
    "confirmacion",
    "confirmación",
    "participara",
    "participará",
    "mi hijo participara",
    "mi hijo participará",
    "viaja",
    "asiste",
    "estado",
    "respuesta"
  ]);
  const source = normalize(field);

  if (/\b(no|no viaja|rechaza|declina|no confirma)\b/.test(source)) return "declined";
  if (/\b(si|sí|viaja|confirmo|confirma|acepta|voy)\b/.test(source)) return "confirmed";
  return "pending";
}

function extractResponse(row) {
  const firstName = clean(pickField(row, ["firstName", "firstname", "nombre del alumno", "nombre"]));
  const lastName = clean(pickField(row, ["lastName", "lastname", "apellido del alumno", "apellido"]));
  const combinedName = clean(pickField(row, ["name", "alumno", "nombre y apellido", "estudiante"]));
  const name = combinedName || `${firstName} ${lastName}`.trim();
  const observations = clean(pickField(row, ["comentarios observaciones", "observaciones", "observacion", "comentarios", "comentario", "solicitud", "aclaraciones"]));
  const allText = Object.values(row).join(" ");
  const timestamp = clean(pickField(row, ["marca temporal", "timestamp", "fecha"]));

  return {
    timestamp,
    firstName,
    lastName,
    name,
    key: personKey({ first: firstName, last: lastName, name }),
    variants: nameVariants({ first: firstName, last: lastName, name }),
    dni: clean(pickField(row, ["dni del alumno", "dni"])),
    course: clean(pickField(row, ["curso"])),
    status: detectStatus(row),
    confirmation: clean(pickField(row, ["mi hijo a participara del viaje de egresados", "participara", "confirmacion", "viaja"])),
    guardian: clean(pickField(row, ["guardian", "apellido y nombre del padre madre o responsable", "padre madre responsable", "responsable", "padre", "madre"])),
    phone: clean(pickField(row, ["phone", "telefono de contacto", "teléfono de contacto", "telefono", "teléfono", "celular"])),
    email: clean(pickField(row, ["correo electronico de contacto", "correo electrónico de contacto", "email", "mail"])),
    observations,
    flags: specialRules.filter((rule) => matchesRule(rule, `${observations} ${allText}`)).map((rule) => rule.key)
  };
}

function dedupeResponses(rows) {
  const byStudent = new Map();
  rows.map(extractResponse).filter((response) => response.key).forEach((response) => {
    const current = byStudent.get(response.key);
    const nextTime = Date.parse(response.timestamp);
    const currentTime = Date.parse(current?.timestamp || "");
    if (!current || (Number.isFinite(nextTime) && (!Number.isFinite(currentTime) || nextTime >= currentTime))) {
      byStudent.set(response.key, response);
    }
  });
  return Array.from(byStudent.values());
}

function mergeStudents(students, responses) {
  const responseByKey = new Map();
  responses.forEach((response) => {
    [response.key, ...(response.variants || [])].filter(Boolean).forEach((key) => {
      if (!responseByKey.has(key)) responseByKey.set(key, response);
    });
  });

  function findResponse(split) {
    const variants = nameVariants(split);
    const exact = variants.map((variant) => responseByKey.get(variant)).find(Boolean);
    if (exact) return exact;

    const studentFirst = firstToken(split.first);
    const studentLast = firstToken(split.last);
    return responses.find((response) => {
      const responseFirst = firstToken(response.firstName || response.name);
      const responseLast = firstToken(response.lastName);
      return responseLast === studentLast && editDistance(responseFirst, studentFirst) <= 2;
    });
  }

  return students.map((student) => {
    const split = splitStudentName(student.name);
    const response = findResponse(split);
    return {
      ...student,
      displayName: split.display || student.name,
      status: response?.status || "pending",
      observations: response?.observations || "",
      flags: response?.flags || [],
      responseName: response?.name || "",
      response
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

async function rowsFromFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx" || extension === "xls") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  }
  return parseCsv(await file.text());
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
                  style={{ width: `${(data[status] / data.total) * 100}%`, background: statusMeta[status].color }}
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

function StudentRow({ student, onDetails }) {
  const specialLabels = specialRules.filter((rule) => student.flags.includes(rule.key));
  return (
    <article className="student-row">
      <div className="student-main">
        <div className="student-order">{student.course}-{student.order}</div>
        <div>
          <h3>{student.name}</h3>
          {student.responseName && student.responseName !== student.displayName && <p>Respuesta: {student.responseName}</p>}
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
        <button type="button" className="detail-button" onClick={() => onDetails(student)}>
          <UserRound size={16} />
          Ver datos sensibles
        </button>
      </div>
    </article>
  );
}

function AuthModal({ error, password, onPasswordChange, onSubmit, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="details-modal auth-modal" role="dialog" aria-modal="true" aria-label="Contraseña requerida" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
          <X size={18} />
        </button>
        <p className="eyebrow-modal">Datos sensibles</p>
        <h2>Contraseña requerida</h2>
        <p className="auth-copy">Ingresá la contraseña para ver observaciones, responsables y datos de contacto.</p>
        <label className="password-field">
          <span>Contraseña</span>
          <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} autoFocus />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="auth-submit">Acceder</button>
      </form>
    </div>
  );
}

function DetailsModal({ student, onClose }) {
  if (!student) return null;
  const response = student.response;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="details-modal" role="dialog" aria-modal="true" aria-label={`Datos de ${student.name}`} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
          <X size={18} />
        </button>
        <p className="eyebrow-modal">{student.course}-{student.order}</p>
        <h2>{student.name}</h2>
        <StatusPill status={student.status} />
        <div className="detail-grid">
          <div>
            <span>Responsable</span>
            <strong>{response?.guardian || "Sin dato cargado"}</strong>
          </div>
          <div>
            <span>DNI alumno</span>
            <strong>{response?.dni || "Sin dato cargado"}</strong>
          </div>
          <div>
            <span>Telefono</span>
            <strong>{response?.phone || "Sin dato cargado"}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{response?.email || "Sin dato cargado"}</strong>
          </div>
        </div>
        <div className="contact-actions">
          {response?.phone && (
            <a href={`tel:${response.phone}`}>
              <Phone size={16} />
              Llamar
            </a>
          )}
          {response?.email && (
            <a href={`mailto:${response.email}`}>
              <Mail size={16} />
              Email
            </a>
          )}
        </div>
        <div className="modal-note">
          <span>Observaciones</span>
          <p>{response?.observations || "Sin observaciones."}</p>
        </div>
      </section>
    </div>
  );
}

function App() {
  const [students, setStudents] = useState([]);
  const [responses, setResponses] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [specialOnly, setSpecialOnly] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("Cargando respuestas actuales");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [authTarget, setAuthTarget] = useState(null);
  const [sensitiveUnlocked, setSensitiveUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    fetch(STUDENT_SOURCE).then((response) => response.json()).then(setStudents);

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setResponses(dedupeResponses(parsed));
      setSourceLabel(`${parsed.length} filas cargadas desde este navegador`);
      return;
    }

    fetch(RESPONSE_SOURCE)
      .then((response) => response.json())
      .then((rows) => {
        setResponses(dedupeResponses(rows));
        setSourceLabel(`${rows.length} respuestas actuales cargadas`);
      })
      .catch(() => setSourceLabel("Carga CSV o XLSX de respuestas"));
  }, []);

  const rows = useMemo(() => mergeStudents(students, responses), [students, responses]);
  const summary = useMemo(() => buildSummary(rows), [rows]);
  const visibleRows = useMemo(() => {
    const needle = normalize(query);
    return rows.filter((row) => {
      const matchesQuery = normalize(`${row.name} ${row.responseName}`).includes(needle);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesCourse = courseFilter === "all" || row.course === courseFilter;
      const matchesSpecial = !specialOnly || row.flags.length > 0;
      return matchesQuery && matchesStatus && matchesCourse && matchesSpecial;
    });
  }, [rows, query, statusFilter, courseFilter, specialOnly]);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsedRows = await rowsFromFile(file);
      const nextResponses = dedupeResponses(parsedRows);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedRows));
      setResponses(nextResponses);
      setSourceLabel(`${nextResponses.length} alumnos actualizados desde ${file.name}`);
    } catch (error) {
      console.error(error);
      setSourceLabel(`No se pudo leer ${file.name}`);
    } finally {
      event.target.value = "";
    }
  }

  function requestSensitiveAccess(target) {
    if (sensitiveUnlocked) {
      if (target === "export") exportView();
      else setSelectedStudent(target);
      return;
    }
    setAuthTarget(target);
    setPassword("");
    setAuthError("");
  }

  function closeAuth() {
    setAuthTarget(null);
    setPassword("");
    setAuthError("");
  }

  function handleAuthSubmit(event) {
    event.preventDefault();
    if (password !== SENSITIVE_PASSWORD) {
      setAuthError("Contraseña incorrecta.");
      return;
    }
    setSensitiveUnlocked(true);
    const target = authTarget;
    closeAuth();
    if (target === "export") exportView();
    else if (target) setSelectedStudent(target);
  }

  function exportView() {
    const lines = ["Curso,Orden,Alumno,Estado,Responsable,Telefono,Email,Observaciones"];
    visibleRows.forEach((row) => {
      lines.push(
        [
          row.course,
          row.order,
          row.name,
          statusMeta[row.status].label,
          row.response?.guardian || "",
          row.response?.phone || "",
          row.response?.email || "",
          row.observations
        ]
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
          <span>Cargar CSV o XLSX de respuestas</span>
          <small>{sourceLabel}</small>
          <input type="file" accept=".csv,.tsv,.xlsx,.xls,text/csv,text/tab-separated-values" onChange={handleFile} />
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
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar alumno, responsable u observacion" />
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
            <button type="button" onClick={() => requestSensitiveAccess("export")}>
              <Download size={16} />
              Exportar vista
            </button>
          </div>
        </section>

        <section className="student-list">
          {visibleRows.map((student) => (
            <StudentRow key={`${student.course}-${student.order}-${student.name}`} student={student} onDetails={requestSensitiveAccess} />
          ))}
        </section>
      </main>
      <DetailsModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />
      {authTarget && (
        <AuthModal
          error={authError}
          password={password}
          onPasswordChange={setPassword}
          onSubmit={handleAuthSubmit}
          onClose={closeAuth}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
