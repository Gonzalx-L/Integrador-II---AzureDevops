import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import axios from "axios";
import jsPDF from "jspdf";
import { API_BASE_URL } from "../authConfig";
import PipelineDiagram from "../components/PipelineDiagram";
import "./DashboardPage.css";

type Page = "inicio" | "subir" | "documentos" | "reportes";

interface DocItem {
  name: string; path: string; country: string; countryName: string;
  status: string; size: number; lastModified: string;
}

const COLORS = ["#1e3a5f","#e91e63","#ff9800","#4caf50","#9c27b0","#00bcd4"];

const PILL: Record<string, string> = {
  LIMPIO: "pill-limpio", PROCESADO: "pill-procesado", ERROR: "pill-error",
  EN_PROCESO: "pill-revision",
  "En revisión": "pill-revision", Aprobado: "pill-aprobado", Completado: "pill-completado",
};

function StatusPill({ s }: { s: string }) {
  const label = s === "LIMPIO" ? "● Limpio"
    : s === "PROCESADO" ? "● Completado"
    : s === "ERROR" ? "● Error"
    : s === "EN_PROCESO" ? "⏳ En proceso"
    : `● ${s}`;
  return <span className={`status-pill ${PILL[s] || "pill-limpio"}`}>{label}</span>;
}

// ── SIDEBAR ──────────────────────────────────────────────
function Sidebar({ page, setPage, user, onLogout, collapsed, setCollapsed }: any) {
  const initials = (user?.name || "U").split(" ").map((w: string) => w[0]).slice(0,2).join("").toUpperCase();
  const isAdmin = true; // se controla más abajo con roles

  const navItems: [Page, string, string, number?][] = isAdmin
    ? [["inicio","🏠","Inicio"],["subir","📤","Subir Archivo"],["documentos","📄","Documentos",15],["reportes","📊","Reportes"]]
    : [["subir","📤","Subir Archivo"]];

  return (
    <aside className={`sidebar${collapsed?" collapsed":""}`}>
      <div className="sidebar-brand" onClick={() => setCollapsed(!collapsed)}>
        <div className="sidebar-brand-icon">📁</div>
        <span className="sidebar-brand-name">DocuColab</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(([id, icon, label, badge]) => (
          <button key={id} className={`nav-item${page===id?" active":""}`} onClick={() => setPage(id)}>
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
            {badge && <span className="nav-badge">{badge}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-user">
        <div className="user-avatar">{initials}</div>
        <div className="user-info">
          <div className="user-name">{user?.name || "Usuario"}</div>
          <div className="user-role">Colaborador Senior</div>
        </div>
        <button className="btn-logout" onClick={onLogout} title="Cerrar sesión">↩</button>
      </div>
    </aside>
  );
}

// ── TOPBAR ────────────────────────────────────────────────
function Topbar({ section, user }: any) {
  const initials = (user?.name || "U").split(" ").map((w: string) => w[0]).slice(0,2).join("").toUpperCase();
  return (
    <div className="topbar">
      <div className="search-box">
        <span>🔍</span>
        <input placeholder="Buscar documentos, tareas..." />
      </div>
      <div className="topbar-right">
        <span className="topbar-section">{section}</span>
        <button className="notif-btn">🔔<span className="notif-dot" /></button>
        <div className="topbar-avatar">{initials}</div>
        <div className="topbar-user-info">
          <div className="topbar-name">{(user?.name || "Usuario").split(" ")[0]}</div>
          <div className="topbar-role">Colaborador Senior</div>
        </div>
      </div>
    </div>
  );
}

// ── INICIO ────────────────────────────────────────────────
function InicioPage({ docs, onUpload, userName }: { docs: DocItem[]; onUpload: () => void; userName: string }) {
  const nombre     = userName.split(" ")[0];
  const total      = docs.length || 24;
  const procesados = docs.filter(d=>d.status==="PROCESADO").length || 18;
  const errores    = docs.filter(d=>d.status==="ERROR").length || 3;
  const limpios    = docs.filter(d=>d.status==="LIMPIO").length || 2;
  const scanning   = Math.max(0, docs.length - docs.filter(d=>["LIMPIO","PROCESADO","ERROR"].includes(d.status)).length);

  const stats = [
    { icon:"📄", color:"blue",   num:total,      label:"Documentos subidos",  sub:"Total registrado" },
    { icon:"✅", color:"green",  num:procesados,  label:"Archivos procesados", sub:"Flujo completado" },
    { icon:"🔒", color:"red",    num:errores,     label:"Amenazas / Errores",  sub:"Detectados por Defender" },
    { icon:"📂", color:"orange", num:limpios,     label:"Archivos limpios",    sub:"Sin amenazas" },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Bienvenido, {nombre} 👋</h1>
        <p>Panel de control — Bluetab Solutions</p>
      </div>

      <div className="stats-grid" style={{gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
        {stats.map((s,i) => (
          <div className="stat-card" key={i}>
            <div className="stat-top">
              <div className={`stat-icon ${s.color}`}>{s.icon}</div>
              <div className="stat-num">{s.num}</div>
            </div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <PipelineDiagram
        limpios={limpios}
        protegidos={procesados}
        errores={errores}
        scanning={scanning > 0}
      />

      <div className="upload-banner" onClick={onUpload}>
        <span className="upload-banner-icon">📤</span>
        <div className="upload-banner-text">
          <div className="upload-banner-title">Subir archivo mensual</div>
          <div className="upload-banner-sub">Formato ZIP cifrado · Antes del 30 de mayo</div>
        </div>
        <span className="upload-banner-arrow">›</span>
      </div>
    </div>
  );
}

// ── SUBIR ARCHIVO ─────────────────────────────────────────
function SubirPage({ docs, countries, onUploaded, userName, isAdmin }: any) {
  const [file, setFile]       = useState<File|null>(null);
  const [country, setCountry] = useState("");
  const [msg, setMsg]         = useState("");
  const [isError, setIsError] = useState(false);
  const [uploading, setUploading] = useState(false);

  const submit = async () => {
    if (!file || !country) { setMsg("Selecciona un archivo ZIP y un país."); setIsError(true); return; }
    setUploading(true); setMsg("");
    try {
      const form = new FormData();
      form.append("file", file); form.append("countryCode", country);
      await axios.post(`${API_BASE_URL}/upload`, form);
      setMsg("✅ Archivo subido exitosamente. El escaneo iniciará en breve.");
      setIsError(false); setFile(null); setCountry("");
      setTimeout(onUploaded, 3000);
    } catch (e: any) {
      setMsg(`❌ ${e.response?.data?.error || e.message}`); setIsError(true);
    } finally { setUploading(false); }
  };

  const recent = docs.length > 0 ? docs.slice(0,3) : [
    { name:"informe_abril_2025.zip",   date:"02 Abr 2025", size:"2.4 MB", status:"En revisión" },
    { name:"informe_marzo_2025.zip",   date:"01 Mar 2025", size:"1.8 MB", status:"Completado" },
    { name:"informe_febrero_2025.zip", date:"03 Feb 2025", size:"2.1 MB", status:"Completado" },
  ];

  const nombre = (userName || "Usuario").split(" ")[0];

  return (
    <div style={{maxWidth:620}}>
      <div className="page-header">
        <h1>Hola, {nombre}. Sube tu archivo mensual.</h1>
        <p>Solo se aceptan archivos .ZIP cifrados · Plazo: 30 de mayo</p>
      </div>

      {/* Selector de país */}
      <div className="card" style={{padding:"20px 24px",marginBottom:16}}>
        <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>País / Sede</label>
        <select value={country} onChange={e=>setCountry(e.target.value)}
          style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,outline:"none"}}>
          <option value="">Seleccionar país...</option>
          {countries.map((c:any)=><option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>

      {/* Dropzone */}
      <div className="dropzone"
        onDrop={e=>{e.preventDefault(); const f=e.dataTransfer.files[0]; if(f?.name.endsWith(".zip")) setFile(f);}}
        onDragOver={e=>e.preventDefault()}
        onClick={()=>document.getElementById("fileInput")?.click()}
        style={{marginBottom:16}}>
        <input id="fileInput" type="file" accept=".zip" style={{display:"none"}} onChange={e=>setFile(e.target.files?.[0]||null)} />
        <div className="dropzone-icon">📤</div>
        {file ? <h3 style={{color:"#1e3a5f"}}>📎 {file.name}</h3> : <h3>Arrastra tu archivo .ZIP cifrado aquí</h3>}
        <p>o <span className="dropzone-link">haz clic para seleccionar</span></p>
        <p className="dropzone-note">Solo archivos .ZIP</p>
      </div>

      {msg && <div className={`upload-msg${isError?" error":""}`} style={{marginBottom:16}}>{msg}</div>}

      <button className="btn-submit" style={{padding:"12px 32px",fontSize:14,marginBottom:24,borderRadius:10}} onClick={submit} disabled={uploading}>
        {uploading ? "⏳ Subiendo..." : "Subir archivo"}
      </button>

      {isAdmin && (
        <div className="upload-table-wrap">
          <div className="upload-table-header">
            <h3>Mis últimos archivos</h3>
            <span>{recent.length} registros</span>
          </div>
          <table>
            <thead><tr><th>Archivo</th><th>Fecha</th><th>Tamaño</th><th>Estado</th></tr></thead>
            <tbody>
              {(recent as any[]).map((d,i)=>(
                <tr key={i}>
                  <td><div className="td-file">📄 {d.name}</div></td>
                  <td>{d.date || new Date(d.lastModified).toLocaleDateString("es-PE")}</td>
                  <td>{d.size || "—"}</td>
                  <td><StatusPill s={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── DOCUMENTOS ────────────────────────────────────────────
function DocumentosPage({ docs }: any) {
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 6;

  const rows = docs.length > 0 ? docs : [
    { name:"informe_abril_2025.zip",    owner:"C. Mendoza", color:"#1e3a5f", date:"02 Abr 2025", size:"2.4 MB", status:"En revisión" },
    { name:"contrato_proveedor_Q1.pdf", owner:"A. López",   color:"#e91e63", date:"28 Mar 2025", size:"1.1 MB", status:"Aprobado" },
    { name:"politica_datos_v3.docx",    owner:"R. Gómez",   color:"#ff9800", date:"20 Mar 2025", size:"340 KB", status:"LIMPIO" },
    { name:"informe_marzo_2025.zip",    owner:"C. Mendoza", color:"#1e3a5f", date:"01 Mar 2025", size:"1.8 MB", status:"Completado" },
    { name:"auditoria_IT_2025.xlsx",    owner:"P. Vargas",  color:"#4caf50", date:"15 Feb 2025", size:"980 KB", status:"Aprobado" },
    { name:"informe_febrero_2025.zip",  owner:"C. Mendoza", color:"#1e3a5f", date:"03 Feb 2025", size:"2.1 MB", status:"Completado" },
  ];

  const filtered = (rows as any[]).filter(r =>
    (filter==="Todos" || r.status===filter || r.status===filter.toUpperCase()) &&
    (!search || r.name?.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated  = filtered.slice((currentPage-1)*PER_PAGE, currentPage*PER_PAGE);

  return (
    <div>
      <div className="page-header"><h1>Documentos</h1><p>Historial completo de documentos en EMPRESA_A</p></div>
      <div className="docs-filters">
        {["Todos","En revisión","Aprobado","Completado","Limpio"].map(f=>(
          <button key={f} className={`filter-btn${filter===f?" active":""}`} onClick={()=>{setFilter(f);setCurrentPage(1);}}>{f}</button>
        ))}
        <div className="doc-search">
          <span>🔍</span>
          <input placeholder="Buscar documento..." value={search} onChange={e=>{setSearch(e.target.value);setCurrentPage(1);}} />
        </div>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>#</th><th>Nombre del archivo</th><th>Propietario</th><th>Fecha</th><th>Tamaño</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {paginated.map((d,i)=>(
              <tr key={i}>
                <td style={{color:"#94a3b8"}}>{(currentPage-1)*PER_PAGE+i+1}</td>
                <td><div className="td-file">📄 {d.name}</div></td>
                <td>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span className="owner-chip" style={{background:d.color||COLORS[i%COLORS.length]}}>
                      {(d.owner||d.countryName||"?").charAt(0)}
                    </span>
                    {d.owner || d.countryName}
                  </div>
                </td>
                <td>{d.date||(d.lastModified?new Date(d.lastModified).toLocaleDateString("es-PE"):"—")}</td>
                <td>{d.size||"—"}</td>
                <td><StatusPill s={d.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pagination">
          <span className="pagination-info">Mostrando {(currentPage-1)*PER_PAGE+1}–{Math.min(currentPage*PER_PAGE,filtered.length)} de {filtered.length} documentos</span>
          <div className="page-btns">
            <button className="page-btn" onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} disabled={currentPage===1}>‹</button>
            {Array.from({length:totalPages},(_,i)=>i+1).map(n=>(
              <button key={n} className={`page-btn${n===currentPage?" active":""}`} onClick={()=>setCurrentPage(n)}>{n}</button>
            ))}
            <button className="page-btn" onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} disabled={currentPage===totalPages}>›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── REPORTES ──────────────────────────────────────────────
function ReportesPage() {
  const months = ["Nov","Dic","Ene","Feb","Mar","Abr"];
  const bars   = [1,8,2,1,0,3];
  const maxBar = Math.max(...bars);
  const threats= [
    { label:"Troyano",         color:"#ef4444", pct:45, count:"4 archivos" },
    { label:"PUA / Adware",    color:"#f59e0b", pct:22, count:"2 archivos" },
    { label:"Macro maliciosa", color:"#8b5cf6", pct:22, count:"2 archivos" },
    { label:"Ransomware",      color:"#ec4899", pct:11, count:"1 archivo"  },
  ];
  const history= [
    { file:"informe_abril_2025.zip",  col:"C. Mendoza", date:"02 Abr 2025", threat:"Trojan.GenericKD 71825102", cat:"Troyano", sev:"Alta",  action:"Cuarentena" },
    { file:"informe_enero_2025.zip",  col:"C. Mendoza", date:"02 Ene 2025", threat:"Trojan.GenericKD 69021445", cat:"Troyano", sev:"Alta",  action:"Cuarentena" },
  ];
  const stats= [
    { icon:"📄", num:87,   label:"Total analizados",    sub:"Todos los archivos" },
    { icon:"🔒", num:9,    label:"Amenazas detectadas", sub:"Histórico total" },
    { icon:"📊", num:"10%",label:"Tasa de infección",   sub:"Del total subido" },
    { icon:"✅", num:78,   label:"Archivos limpios",    sub:"Sin amenazas" },
  ];

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210; // ancho A4
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-PE", { year:"numeric", month:"long", day:"numeric" });
    const timeStr = now.toLocaleTimeString("es-PE", { hour:"2-digit", minute:"2-digit" });
    const generated = `${dateStr} — ${timeStr}`;

    // ── NAVBAR / HEADER ──────────────────────────────────
    // Barra azul superior
    doc.setFillColor(30, 58, 95);
    doc.rect(0, 0, W, 28, "F");

    // ── Logo Bluetab recreado con texto ──
    // "/" en azul oscuro
    doc.setTextColor(58, 54, 153);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("/", 11, 19);

    // "blue" en gradiente azul-morado (simulado con azul)
    doc.setTextColor(80, 60, 180);
    doc.setFontSize(18);
    doc.text("blue", 16, 19);

    // "tab" en naranja-rojo
    doc.setTextColor(210, 70, 30);
    doc.text("tab", 34, 19);

    // "an IBM Company" pequeño
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 200, 200);
    doc.text("an IBM Company", 11, 23);

    // Título del reporte — derecha
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("DocuColab — Reporte de Seguridad", W - 10, 13, { align: "right" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Azure Defender · Análisis de Amenazas · Bluetab Solutions Perú", W - 10, 19, { align: "right" });

    // Línea separadora bajo el header
    doc.setDrawColor(30, 58, 95);
    doc.setLineWidth(0.5);
    doc.line(10, 32, W - 10, 32);

    // Fecha de generación
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "italic");
    doc.text(`Generado el: ${generated}`, 10, 37);
    doc.text("Clasificación: Uso interno", W - 10, 37, { align: "right" });

    let y = 45;

    // ── SECCIÓN 1: RESUMEN EJECUTIVO ─────────────────────
    doc.setFillColor(241, 245, 249);
    doc.rect(10, y, W - 20, 7, "F");
    doc.setTextColor(30, 58, 95);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("1. RESUMEN EJECUTIVO", 13, y + 5);
    y += 12;

    // 4 stats en fila
    const statBoxW = (W - 20) / 4;
    const statColors: [number,number,number][] = [[219,234,254],[220,252,231],[254,226,226],[255,251,235]];
    const statBorderColors: [number,number,number][] = [[59,130,246],[22,163,74],[220,38,38],[234,179,8]];

    stats.forEach((s, i) => {
      const bx = 10 + i * statBoxW;
      doc.setFillColor(...statColors[i]);
      doc.roundedRect(bx, y, statBoxW - 2, 20, 2, 2, "F");
      doc.setDrawColor(...statBorderColors[i]);
      doc.setLineWidth(0.8);
      doc.line(bx, y, bx, y + 20); // borde izquierdo coloreado
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(String(s.num), bx + statBoxW/2 - 1, y + 10, { align: "center" });
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(s.label, bx + statBoxW/2 - 1, y + 16, { align: "center" });
    });
    y += 26;

    // ── SECCIÓN 2: DETECCIONES POR MES ───────────────────
    doc.setFillColor(241, 245, 249);
    doc.rect(10, y, W - 20, 7, "F");
    doc.setTextColor(30, 58, 95);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("2. DETECCIONES POR MES", 13, y + 5);
    y += 12;

    // Tabla de detecciones
    const tHeaders = ["Mes", "Detecciones", "Nivel de riesgo"];
    const colW = [30, 40, 60];
    const riskLabel = (n: number) => n === 0 ? "Sin riesgo" : n <= 2 ? "Bajo" : n <= 5 ? "Medio" : "Alto";
    const riskColor = (n: number): [number,number,number] => n === 0 ? [22,163,74] : n <= 2 ? [234,179,8] : n <= 5 ? [249,115,22] : [220,38,38];

    // Header tabla
    doc.setFillColor(30, 58, 95);
    doc.rect(10, y, colW[0]+colW[1]+colW[2]+6, 7, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    let cx = 13;
    tHeaders.forEach((h,i) => { doc.text(h, cx, y+5); cx += colW[i]; });
    y += 7;

    months.forEach((m, i) => {
      doc.setFillColor(i%2===0 ? 248 : 255, i%2===0 ? 250 : 255, i%2===0 ? 252 : 255);
      doc.rect(10, y, colW[0]+colW[1]+colW[2]+6, 7, "F");
      doc.setTextColor(51, 65, 85);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      cx = 13;
      doc.text(m, cx, y+5); cx += colW[0];
      doc.text(String(bars[i]), cx, y+5); cx += colW[1];
      // Pill de riesgo
      const [r,g,b] = riskColor(bars[i]);
      doc.setFillColor(r,g,b);
      doc.roundedRect(cx, y+1.5, 28, 4, 1, 1, "F");
      doc.setTextColor(255,255,255);
      doc.setFontSize(7);
      doc.text(riskLabel(bars[i]), cx+14, y+5, { align:"center" });
      y += 7;
    });
    y += 6;

    // ── SECCIÓN 3: TIPOS DE AMENAZA ───────────────────────
    doc.setFillColor(241, 245, 249);
    doc.rect(10, y, W - 20, 7, "F");
    doc.setTextColor(30, 58, 95);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("3. CLASIFICACIÓN DE AMENAZAS", 13, y + 5);
    y += 12;

    threats.forEach((t) => {
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      // Punto de color
      const [r,g,b] = t.color === "#ef4444" ? [239,68,68] : t.color === "#f59e0b" ? [245,158,11] : t.color === "#8b5cf6" ? [139,92,246] : [236,72,153];
      doc.setFillColor(r,g,b);
      doc.circle(15, y+2, 2, "F");
      doc.text(t.label, 20, y+4);
      // Barra de progreso
      doc.setFillColor(226,232,240);
      doc.rect(70, y, 80, 5, "F");
      doc.setFillColor(r,g,b);
      doc.rect(70, y, 80*(t.pct/100), 5, "F");
      doc.setTextColor(100,116,139);
      doc.text(`${t.pct}% — ${t.count}`, 155, y+4);
      y += 9;
    });
    y += 4;

    // ── SECCIÓN 4: HISTORIAL DE AMENAZAS ─────────────────
    doc.setFillColor(241, 245, 249);
    doc.rect(10, y, W - 20, 7, "F");
    doc.setTextColor(30, 58, 95);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("4. HISTORIAL DE AMENAZAS DETECTADAS", 13, y + 5);
    y += 12;

    const hHeaders = ["Archivo", "Colaborador", "Fecha", "Amenaza", "Severidad", "Acción"];
    const hColW    = [45, 25, 20, 45, 18, 20];
    doc.setFillColor(30, 58, 95);
    doc.rect(10, y, hColW.reduce((a,b)=>a+b,0)+6, 7, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    cx = 13;
    hHeaders.forEach((h,i) => { doc.text(h, cx, y+5); cx += hColW[i]; });
    y += 7;

    history.forEach((h, i) => {
      doc.setFillColor(i%2===0 ? 248 : 255, i%2===0 ? 250 : 255, i%2===0 ? 252 : 255);
      doc.rect(10, y, hColW.reduce((a,b)=>a+b,0)+6, 8, "F");
      doc.setTextColor(51,65,85);
      doc.setFont("helvetica","normal");
      doc.setFontSize(7);
      cx = 13;
      [h.file, h.col, h.date, h.threat].forEach((val,vi) => {
        const txt = doc.splitTextToSize(val, hColW[vi]-2)[0];
        doc.text(txt, cx, y+5); cx += hColW[vi];
      });
      // Severidad coloreada
      doc.setFillColor(h.sev==="Alta"?220:245, h.sev==="Alta"?38:158, h.sev==="Alta"?38:11);
      doc.roundedRect(cx, y+1.5, 14, 4.5, 1, 1, "F");
      doc.setTextColor(255,255,255);
      doc.text(h.sev, cx+7, y+5, {align:"center"});
      cx += hColW[4];
      doc.setTextColor(245,158,11);
      doc.setFont("helvetica","bold");
      doc.text(h.action, cx, y+5);
      y += 8;
    });

    // ── FOOTER ────────────────────────────────────────────
    const pageH = 297;
    doc.setFillColor(30, 58, 95);
    doc.rect(0, pageH - 14, W, 14, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(7);
    doc.setFont("helvetica","normal");
    doc.text("/bluetab an IBM Company — DocuColab | Documento de uso interno", 10, pageH - 7);
    doc.text(`Página 1 de 1  |  ${generated}`, W - 10, pageH - 7, { align:"right" });

    doc.save(`reporte-azure-defender-${now.toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div className="page-header" style={{margin:0}}>
          <h1>Reportes — Azure Defender</h1>
          <p>Análisis de amenazas en archivos subidos por colaboradores de EMPRESA_A</p>
        </div>
        <button className="btn-pdf" onClick={exportPDF}>📄 Exportar PDF</button>
      </div>
      <div className="stats-grid" style={{marginBottom:20}}>
        {stats.map((s,i)=>(
          <div className="stat-card" key={i}>
            <div className="stat-top">
              <div className={`stat-icon ${["blue","red","orange","green"][i]}`}>{s.icon}</div>
              <div className="stat-num">{s.num}</div>
            </div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="two-cols" style={{marginBottom:16}}>
        <div className="card">
          <div className="card-header"><h3>Detecciones por mes</h3><span style={{fontSize:11,color:"#94a3b8"}}>Últimos 6 meses</span></div>
          <div className="card-body">
            {months.map((m,i)=>(
              <div className="report-bar-row" key={i}>
                <span className="report-bar-label">{m}</span>
                <div className="report-bar-wrap">
                  <div className="report-bar-fill" style={{width:maxBar>0?`${(bars[i]/maxBar)*100}%`:"0%",background:bars[i]>4?"#ef4444":bars[i]>1?"#f59e0b":"#22c55e"}}/>
                </div>
                <span className="report-bar-count">{bars[i]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>Tipos de amenaza</h3></div>
          <div className="card-body">
            {threats.map((t,i)=>(
              <div className="threat-type-row" key={i}>
                <div className="threat-dot" style={{background:t.color}}/>
                <span className="threat-label">{t.label}</span>
                <div className="threat-bar-wrap"><div className="threat-bar-fill" style={{width:`${t.pct}%`,background:t.color}}/></div>
                <span className="threat-count">{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><h3>Historial de amenazas</h3><span style={{fontSize:12,color:"#94a3b8"}}>{history.length} registros</span></div>
        <table>
          <thead><tr><th>Archivo</th><th>Colaborador</th><th>Fecha</th><th>Amenaza</th><th>Categoría</th><th>Severidad</th><th>Acción</th></tr></thead>
          <tbody>
            {history.map((h,i)=>(
              <tr key={i}>
                <td><div className="td-file" style={{color:"#ef4444"}}>📄 {h.file}</div></td>
                <td>{h.col}</td><td>{h.date}</td>
                <td style={{color:"#ef4444",fontSize:12}}>{h.threat}</td>
                <td>{h.cat}</td>
                <td><span style={{color:h.sev==="Alta"?"#ef4444":"#f59e0b",fontWeight:700}}>{h.sev}</span></td>
                <td><span style={{color:"#f59e0b",fontWeight:600}}>{h.action}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── MAIN DASHBOARD ────────────────────────────────────────
export default function DashboardPage() {
  const { instance, accounts } = useMsal();
  const user = accounts[0];
  const [page, setPage]           = useState<Page>("inicio");
  const [docs, setDocs]           = useState<DocItem[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  // Rol: en producción se lee del token de Azure AD
  const isAdmin = true; // simplificado hasta implementar roles en Azure AD

  const fetchDocs = useCallback(async () => {
    try {
      const r = await axios.get(`${API_BASE_URL}/documents`);
      setDocs(r.data.documents || []);
      setCountries(r.data.countries || []);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    fetchDocs();
    const t = setInterval(fetchDocs, 15000);
    return () => clearInterval(t);
  }, [fetchDocs]);

  const sections: Record<Page,string> = {
    inicio:"Dashboard", subir:"Subir Archivo", documentos:"Documentos", reportes:"Reportes"
  };

  return (
    <div className="dash-layout">
      <Sidebar
        page={page} setPage={setPage} user={user}
        onLogout={() => instance.logoutPopup()}
        collapsed={collapsed} setCollapsed={setCollapsed}
      />
      <div className={`dash-main${collapsed?" collapsed":""}`}>
        <Topbar section={sections[page]} user={user} />
        <div className="content">
          {page==="inicio"     && <InicioPage     docs={docs} onUpload={()=>setPage("subir")} userName={user?.name||"Usuario"} />}
          {page==="subir"      && <SubirPage      docs={docs} countries={countries} onUploaded={fetchDocs} userName={user?.name||"Usuario"} isAdmin={isAdmin} />}
          {page==="documentos" && isAdmin && <DocumentosPage docs={docs} />}
          {page==="reportes"   && isAdmin && <ReportesPage />}
        </div>
      </div>
    </div>
  );
}
