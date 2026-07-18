import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import axios from "axios";
import jsPDF from "jspdf";
import {
  API_BASE_URL,
  getRolesFromAccount,
  getAllowedRegions,
  isAdminRole,
  ROLE_LABELS,
  type AppRole,
} from "../authConfig";
import PipelineDiagram from "../components/PipelineDiagram";
import RegionClocks from "../components/RegionClocks";
import "./DashboardPage.css";

type Page = "inicio" | "subir" | "documentos" | "reportes";

interface DocItem {
  name: string; path: string; country: string; countryName: string;
  countryCode: string; timezone: string; dateFolder: string;
  // Estados reales de Azure Defender for Storage (malware scanning)
  status: "No threats found" | "Malicious" | "Suspicious" | "Scanning" | "Unscanned" | string;
  size: string | number; lastModified: string; owner?: string;
}

/** Formatea un ISO timestamp en la timezone del país del archivo */
function formatLocalDateTime(isoDate: string | Date | undefined, timezone: string) {
  if (!isoDate) return { date: "—", time: "—", ampm: "", tzLabel: "" };
  const d = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  if (isNaN(d.getTime())) return { date: "—", time: "—", ampm: "", tzLabel: "" };

  const tz = timezone || "UTC";

  // Fecha local en la timezone del país
  const date = new Intl.DateTimeFormat("es-PE", {
    timeZone: tz,
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);

  // Hora 24h en la timezone del país
  const time = new Intl.DateTimeFormat("es-PE", {
    timeZone: tz,
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(d);

  // AM/PM: extraer hora numérica y decidir
  const hour24 = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false }).format(d)
  );
  const ampm = hour24 < 12 ? "AM" : "PM";

  // Abreviatura de timezone usando locale "en-US" para resultado consistente
  // Resultado ejemplo: "7/13/2026, 11:40:10 PM GMT-5" → tomamos la parte tras el último espacio
  const tzFull  = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, timeZoneName: "short",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric",
  }).format(d);
  // tzFull termina con " GMT-5" o "UTC" etc.
  const tzLabel = tzFull.split(" ").pop() || tz;

  return { date, time, ampm, tzLabel };
}

/** Chips de bandera + nombre corto de región */
const REGION_CHIP: Record<string, { flag: string; label: string; color: string }> = {
  PERU:          { flag: "🇵🇪", label: "Perú",          color: "#dc2626" },
  ESPANA:        { flag: "🇪🇸", label: "España",         color: "#f59e0b" },
  ARGENTINA:     { flag: "🇦🇷", label: "Argentina",      color: "#2563eb" },
  NUEVA_ZELANDA: { flag: "🇳🇿", label: "Nueva Zelanda",  color: "#16a34a" },
};

const COLORS = ["#1e3a5f","#e91e63","#ff9800","#4caf50","#9c27b0","#00bcd4"];

/**
 * Mapa de clases CSS para los estados reales de Azure Defender for Storage.
 * Referencia: https://learn.microsoft.com/azure/storage/common/azure-defender-storage-configure
 * Backend maneja inglés (valores reales de Defender), frontend muestra español.
 */
const PILL: Record<string, string> = {
  "No threats found": "pill-limpio",
  "Malicious":        "pill-error",
  "Suspicious":       "pill-suspicious",
  "Scanning":         "pill-revision",
  "Unscanned":        "pill-unscanned",
};

// Traducción visual — solo para mostrar en UI, el valor interno sigue en inglés
const DEFENDER_LABEL: Record<string, string> = {
  "No threats found": "✅ Sin amenazas",
  "Malicious":        "🚫 Malicioso",
  "Suspicious":       "⚠️ Sospechoso",
  "Scanning":         "🔍 Escaneando",
  "Unscanned":        "⏳ Sin escanear",
};

function StatusPill({ s }: { s: string }) {
  const label = DEFENDER_LABEL[s] ?? `● ${s}`;
  return <span className={`status-pill ${PILL[s] || "pill-unscanned"}`}>{label}</span>;
}

// ── SIDEBAR ──────────────────────────────────────────────
function Sidebar({ page, setPage, user, onLogout, collapsed, setCollapsed, isAdmin, roleLabel }: any) {
  const initials = (user?.name || "U").split(" ").map((w: string) => w[0]).slice(0,2).join("").toUpperCase();

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
          <div className="user-role">{roleLabel}</div>
        </div>
        <button className="btn-logout" onClick={onLogout} title="Cerrar sesión">↩</button>
      </div>
    </aside>
  );
}

// ── TOPBAR ────────────────────────────────────────────────
function Topbar({ section, user, roleLabel }: any) {
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
          <div className="topbar-role">{roleLabel}</div>
        </div>
      </div>
    </div>
  );
}

// ── INICIO ────────────────────────────────────────────────
function InicioPage({ docs, onUpload, userName, allowedRegions }: { docs: DocItem[]; onUpload: () => void; userName: string; allowedRegions: string[] }) {
  const nombre     = userName.split(" ")[0];
  const total      = docs.length || 24;
  const limpios    = docs.filter(d => d.status === "No threats found").length || 18;
  const maliciosos = docs.filter(d => d.status === "Malicious").length || 3;
  const scanning   = docs.filter(d => d.status === "Scanning" || d.status === "Unscanned").length || 2;

  const stats = [
    { icon:"📄", color:"blue",   num:total,      label:"Documentos subidos",  sub:"Total registrado" },
    { icon:"✅", color:"green",  num:limpios,     label:"No threats found",    sub:"Escaneo limpio" },
    { icon:"🔒", color:"red",    num:maliciosos,  label:"Malicious / Error",   sub:"Detectados por Defender" },
    { icon:"🔍", color:"orange", num:scanning,    label:"Scanning / Unscanned",sub:"Pendiente de análisis" },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Bienvenido, {nombre} 👋</h1>
        <p>Panel de control — Bluetab Solutions</p>
      </div>

      {/* Relojes por región */}
      <RegionClocks allowedRegions={allowedRegions} />

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
        protegidos={docs.filter(d => d.status === "Suspicious").length}
        errores={maliciosos}
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
function SubirPage({ docs, countries, onUploaded, userName, userEmail, allowedRegions }: any) {
  const [file, setFile]           = useState<File|null>(null);
  const [country, setCountry]     = useState("");
  const [msg, setMsg]             = useState("");
  const [isError, setIsError]     = useState(false);
  const [uploading, setUploading] = useState(false);

  // Historial — filtros para la vista colaborador
  const [histFilter, setHistFilter] = useState("Todos");
  const [histSearch, setHistSearch] = useState("");
  const [histDate,   setHistDate]   = useState("");
  const [histPage,   setHistPage]   = useState(1);
  const HIST_PER_PAGE = 5;

  // Filtrar países según las regiones del rol del token
  const availableCountries = allowedRegions.length > 0
    ? countries.filter((c: any) => allowedRegions.includes(c.code))
    : countries;

  const submit = async () => {
    if (!file || !country) { setMsg("Selecciona un archivo ZIP y un país."); setIsError(true); return; }
    setUploading(true); setMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("countryCode", country);
      if (userEmail) form.append("uploader", userEmail);
      await axios.post(`${API_BASE_URL}/upload`, form);
      setMsg("✅ Archivo subido exitosamente. El escaneo iniciará en breve.");
      setIsError(false); setFile(null); setCountry("");
      setTimeout(onUploaded, 3000);
    } catch (e: any) {
      setMsg(`❌ ${e.response?.data?.error || e.message}`); setIsError(true);
    } finally { setUploading(false); }
  };

  // Filtrar historial por nombre, estado y fecha
  const myDocs = docs.filter((d: any) => {
    const matchStatus = histFilter === "Todos" || d.status === histFilter;
    const matchSearch = !histSearch || d.name?.toLowerCase().includes(histSearch.toLowerCase());
    const matchDate   = !histDate   || (d.lastModified && d.lastModified.startsWith(histDate));
    return matchStatus && matchSearch && matchDate;
  });
  const histTotal = myDocs.length;
  const histPages = Math.ceil(histTotal / HIST_PER_PAGE);
  const histRows  = myDocs.slice((histPage-1)*HIST_PER_PAGE, histPage*HIST_PER_PAGE);

  // Descarga via URL SAS temporal generada por el backend
  const downloadFile = async (d: any) => {
    try {
      const res = await axios.get(
        `${API_BASE_URL}/download?path=${encodeURIComponent(d.path)}`
      );
      const { sasUrl, fileName } = res.data;
      // Abrir la URL SAS — el navegador descarga directo desde Azure Storage
      const a = document.createElement("a");
      a.href     = sasUrl;
      a.download = fileName || d.name;
      a.target   = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e: any) {
      alert(`No se pudo descargar el archivo: ${e?.response?.data?.error || e.message}`);
    }
  };

  // Reporte PDF individual del archivo
  const downloadReport = (d: any) => {
    const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W    = 210;
    const now  = new Date();
    const tz   = d.timezone || "America/Lima";
    const { date, time, ampm, tzLabel } = formatLocalDateTime(d.lastModified, tz);
    const chip = REGION_CHIP[d.country || "PERU"];

    // Header azul
    doc.setFillColor(30, 58, 95);
    doc.rect(0, 0, W, 28, "F");
    doc.setTextColor(80, 60, 180); doc.setFontSize(20); doc.setFont("helvetica","bold");
    doc.text("/", 11, 19);
    doc.setTextColor(80, 60, 180); doc.setFontSize(18); doc.text("blue", 16, 19);
    doc.setTextColor(210, 70, 30); doc.text("tab", 34, 19);
    doc.setFontSize(6); doc.setFont("helvetica","normal"); doc.setTextColor(200,200,200);
    doc.text("an IBM Company", 11, 23);
    doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.setTextColor(255,255,255);
    doc.text("Reporte de Archivo — DocuColab", W-10, 13, {align:"right"});
    doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.text("Azure Defender for Storage · Bluetab Solutions", W-10, 19, {align:"right"});

    doc.setFontSize(8); doc.setTextColor(100,116,139); doc.setFont("helvetica","italic");
    doc.text(`Generado el: ${now.toLocaleDateString("es-PE")} ${now.toLocaleTimeString("es-PE")}`, 10, 34);
    doc.text("Clasificación: Uso interno", W-10, 34, {align:"right"});

    let y = 44;

    // Sección datos del archivo
    doc.setFillColor(241,245,249); doc.rect(10,y,W-20,7,"F");
    doc.setTextColor(30,58,95); doc.setFontSize(10); doc.setFont("helvetica","bold");
    doc.text("INFORMACIÓN DEL ARCHIVO", 13, y+5);
    y += 12;

    const rows2: [string,string][] = [
      ["Nombre",    d.name],
      ["Región",    chip ? `${chip.flag} ${chip.label}` : d.countryName || "—"],
      ["Tamaño",    String(d.size || "—")],
      ["Subido por",d.owner || "—"],
      ["Fecha",     `${date} ${time} ${ampm} (${tzLabel})`],
      ["Ruta",      d.path],
    ];
    rows2.forEach(([label, val]) => {
      doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor(100,116,139);
      doc.text(label, 14, y+5);
      doc.setFont("helvetica","normal"); doc.setTextColor(30,41,59);
      doc.text(String(val), 55, y+5);
      y += 8;
    });
    y += 6;

    // Sección estado Defender
    doc.setFillColor(241,245,249); doc.rect(10,y,W-20,7,"F");
    doc.setTextColor(30,58,95); doc.setFontSize(10); doc.setFont("helvetica","bold");
    doc.text("RESULTADO AZURE DEFENDER FOR STORAGE", 13, y+5);
    y += 14;

    const statusEs = DEFENDER_LABEL[d.status]?.replace(/^[^\s]+\s/,"") || d.status;
    const statusColors: Record<string,[number,number,number]> = {
      "No threats found": [22,163,74], "Malicious": [220,38,38],
      "Suspicious": [234,88,12], "Scanning": [29,78,216], "Unscanned": [100,116,139],
    };
    const [sr,sg,sb] = statusColors[d.status] ?? [100,116,139];
    doc.setFillColor(sr,sg,sb);
    doc.roundedRect(14, y, 60, 10, 3, 3, "F");
    doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont("helvetica","bold");
    doc.text(statusEs, 44, y+7, {align:"center"});
    y += 18;

    doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    const desc: Record<string,string> = {
      "No threats found": "El archivo fue analizado por Azure Defender y no se encontraron amenazas. Es seguro para su uso.",
      "Malicious":        "Azure Defender detectó contenido malicioso en este archivo. No debe ser descargado ni ejecutado.",
      "Suspicious":       "Azure Defender detectó comportamiento sospechoso. Se recomienda revisión manual antes de usar.",
      "Scanning":         "Azure Defender está analizando este archivo. El resultado estará disponible en breve.",
      "Unscanned":        "El archivo aún no ha sido procesado por Azure Defender for Storage.",
    };
    const lines = doc.splitTextToSize(desc[d.status] || "Estado desconocido.", W-28);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 10;

    // Footer
    doc.setFillColor(30,58,95); doc.rect(0,287,W,10,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont("helvetica","normal");
    doc.text("/bluetab an IBM Company — DocuColab | Documento de uso interno", 10, 293);
    doc.text(`${now.toLocaleDateString("es-PE")}`, W-10, 293, {align:"right"});

    doc.save(`reporte-${d.name.replace(".zip","")}.pdf`);
  };

  const nombre = (userName || "Usuario").split(" ")[0];

  return (
    <div style={{width:"100%"}}>
      <div className="page-header">
        <h1>Hola, {nombre}. Sube tu archivo mensual.</h1>
        <p>Solo se aceptan archivos .ZIP cifrados · Plazo: 30 de mayo</p>
      </div>

      {/* ── FILA SUPERIOR: formulario + stats rápidas ── */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, marginBottom:24, alignItems:"start"}}>

        {/* Columna izquierda — formulario */}
        <div style={{display:"flex", flexDirection:"column", gap:16}}>
          <div className="card" style={{padding:"20px 24px"}}>
            <label style={{fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>País / Sede</label>
            <select value={country} onChange={e=>setCountry(e.target.value)}
              style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:14,outline:"none",background:"#fff"}}>
              <option value="">Seleccionar país...</option>
              {availableCountries.map((c:any)=><option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div className="dropzone"
            onDrop={e=>{e.preventDefault(); const f=e.dataTransfer.files[0]; if(f?.name.endsWith(".zip")) setFile(f);}}
            onDragOver={e=>e.preventDefault()}
            onClick={()=>document.getElementById("fileInput")?.click()}>
            <input id="fileInput" type="file" accept=".zip" style={{display:"none"}} onChange={e=>setFile(e.target.files?.[0]||null)} />
            <div className="dropzone-icon">📤</div>
            {file ? <h3 style={{color:"#1e3a5f"}}>📎 {file.name}</h3> : <h3>Arrastra tu archivo .ZIP aquí</h3>}
            <p>o <span className="dropzone-link">haz clic para seleccionar</span></p>
            <p className="dropzone-note">Solo archivos .ZIP</p>
          </div>
          {msg && <div className={`upload-msg${isError?" error":""}`}>{msg}</div>}
          <button className="btn-submit" style={{padding:"14px 32px",fontSize:15,borderRadius:10,width:"100%"}}
            onClick={submit} disabled={uploading}>
            {uploading ? "⏳ Subiendo..." : "📤 Subir archivo"}
          </button>
        </div>

        {/* Columna derecha — tarjetas de resumen */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {[
            { icon:"📄", label:"Mis archivos",    val: docs.length,                                        color:"blue"   },
            { icon:"✅", label:"Sin amenazas",     val: docs.filter((d:any)=>d.status==="No threats found").length, color:"green"  },
            { icon:"⏳", label:"Sin escanear",     val: docs.filter((d:any)=>d.status==="Unscanned").length,        color:"orange" },
            { icon:"🚫", label:"Con amenazas",     val: docs.filter((d:any)=>d.status==="Malicious"||d.status==="Suspicious").length, color:"red" },
          ].map((s,i)=>(
            <div key={i} className="stat-card" style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",padding:"16px 20px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div className={`stat-icon ${s.color}`} style={{width:40,height:40,fontSize:18}}>{s.icon}</div>
                <div className="stat-label" style={{margin:0}}>{s.label}</div>
              </div>
              <div className="stat-num" style={{fontSize:24}}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── HISTORIAL COMPLETO ── */}
      <div className="card">
        <div className="card-header" style={{padding:"16px 20px 12px"}}>
          <h3>📋 Mi historial de archivos</h3>
          <span style={{fontSize:12,color:"#94a3b8"}}>{histTotal} archivos</span>
        </div>

        {/* Filtros */}
        <div style={{padding:"12px 20px",borderBottom:"1px solid #f1f5f9",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          {[
            {label:"Todos",         value:"Todos"},
            {label:"Sin escanear",  value:"Unscanned"},
            {label:"Escaneando",    value:"Scanning"},
            {label:"Sin amenazas",  value:"No threats found"},
            {label:"Sospechoso",    value:"Suspicious"},
            {label:"Malicioso",     value:"Malicious"},
          ].map(f=>(
            <button key={f.value} className={`filter-btn${histFilter===f.value?" active":""}`}
              onClick={()=>{setHistFilter(f.value);setHistPage(1);}}>
              {f.label}
            </button>
          ))}
          {/* Búsqueda por nombre */}
          <div className="doc-search" style={{marginLeft:"auto"}}>
            <span>🔍</span>
            <input placeholder="Buscar por nombre..." value={histSearch}
              onChange={e=>{setHistSearch(e.target.value);setHistPage(1);}} />
          </div>
          {/* Filtro por fecha */}
          <input type="date" value={histDate} onChange={e=>{setHistDate(e.target.value);setHistPage(1);}}
            style={{padding:"6px 10px",border:"1.5px solid #e2e8f0",borderRadius:6,fontSize:13,color:"#374151",outline:"none"}}
            title="Filtrar por fecha" />
        </div>

        {histRows.length === 0 ? (
          <div style={{padding:"48px 24px",textAlign:"center",color:"#94a3b8"}}>
            <div style={{fontSize:40,marginBottom:12}}>📂</div>
            <div style={{fontSize:15,fontWeight:600,color:"#475569"}}>No hay archivos que coincidan</div>
            <div style={{fontSize:13,marginTop:6}}>Sube tu primer archivo ZIP usando el formulario de arriba</div>
          </div>
        ) : (
        <table>
          <thead>
            <tr>
              <th>#</th><th>Nombre del archivo</th><th>Fecha</th><th>Hora</th>
              <th>Tamaño</th><th>Estado</th><th style={{textAlign:"center"}}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {histRows.map((d:any, i:number) => {
              const tz = d.timezone || "America/Lima";
              const { date, time, ampm, tzLabel } = formatLocalDateTime(d.lastModified, tz);
              return (
                <tr key={i}>
                  <td style={{color:"#94a3b8"}}>{(histPage-1)*HIST_PER_PAGE+i+1}</td>
                  <td><div className="td-file">📄 {d.name}</div></td>
                  <td style={{color:"#475569",fontSize:13}}>{date}</td>
                  <td style={{fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>
                    <span style={{color:"#1e293b",fontSize:13,fontWeight:600}}>{time}</span>{" "}
                    <span style={{fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:4,
                      background:ampm==="AM"?"#dbeafe":"#fef3c7",
                      color:ampm==="AM"?"#1d4ed8":"#92400e"}}>{ampm}</span>
                    <span style={{fontSize:10,color:"#94a3b8",marginLeft:3}}>{tzLabel}</span>
                  </td>
                  <td style={{color:"#64748b",fontSize:13}}>{d.size||"—"}</td>
                  <td><StatusPill s={d.status} /></td>
                  <td>
                    <div style={{display:"flex",gap:6,justifyContent:"center"}}>
                      {/* Descargar archivo */}
                      <button title="Descargar archivo" onClick={()=>downloadFile(d)}
                        style={{background:"#eff6ff",color:"#1d4ed8",border:"none",borderRadius:6,
                          padding:"5px 10px",fontSize:12,fontWeight:600,cursor:"pointer",
                          display:"flex",alignItems:"center",gap:4}}>
                        ⬇ ZIP
                      </button>
                      {/* Descargar reporte PDF */}
                      <button title="Descargar reporte PDF" onClick={()=>downloadReport(d)}
                        style={{background:"#fef2f2",color:"#dc2626",border:"none",borderRadius:6,
                          padding:"5px 10px",fontSize:12,fontWeight:600,cursor:"pointer",
                          display:"flex",alignItems:"center",gap:4}}>
                        📄 PDF
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}

        {/* Paginación del historial */}
        {histPages > 1 && (
          <div className="pagination">
            <span className="pagination-info">
              Mostrando {(histPage-1)*HIST_PER_PAGE+1}–{Math.min(histPage*HIST_PER_PAGE,histTotal)} de {histTotal}
            </span>
            <div className="page-btns">
              <button className="page-btn" onClick={()=>setHistPage(p=>Math.max(1,p-1))} disabled={histPage===1}>‹</button>
              {Array.from({length:histPages},(_,i)=>i+1).map(n=>(
                <button key={n} className={`page-btn${n===histPage?" active":""}`} onClick={()=>setHistPage(n)}>{n}</button>
              ))}
              <button className="page-btn" onClick={()=>setHistPage(p=>Math.min(histPages,p+1))} disabled={histPage===histPages}>›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── DOCUMENTOS ────────────────────────────────────────────
function DocumentosPage({ docs, apiLoaded, apiError, allowedRegions }: any) {
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 6;

  // Datos siempre del storage vía API. Mientras carga, array vacío.
  const allRows: any[] = apiLoaded ? docs : [];

  // Filtrar por regiones permitidas según el rol
  const rows = allowedRegions.length > 0
    ? allRows.filter((r: any) => allowedRegions.includes(r.country || r.countryCode))
    : allRows;

  const filtered = (rows as any[]).filter(r =>
    (filter === "Todos" || r.status === filter) &&
    (!search || r.name?.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated  = filtered.slice((currentPage-1)*PER_PAGE, currentPage*PER_PAGE);

  return (
    <div>
      <div className="page-header">
        <h1>Documentos</h1>
        <p>Historial de archivos ZIP — hora y fecha en zona horaria de cada región</p>
      </div>

      {/* Banner de error si el backend falló */}
      {apiError && (
        <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#b91c1c"}}>
          ⚠️ Error al conectar con el backend: <strong>{apiError}</strong>
          <span style={{color:"#94a3b8",marginLeft:8}}>— Asegúrate que <code>func start</code> esté corriendo en el puerto 7071</span>
        </div>
      )}

      {/* Indicador de carga inicial */}
      {!apiLoaded && (
        <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#1d4ed8"}}>
          🔄 Cargando documentos desde Azure Storage...
        </div>
      )}
      <div className="docs-filters">
        {[
          { label: "Todos",          value: "Todos"           },
          { label: "Sin escanear",   value: "Unscanned"       },
          { label: "Escaneando",     value: "Scanning"        },
          { label: "Sin amenazas",   value: "No threats found"},
          { label: "Sospechoso",     value: "Suspicious"      },
          { label: "Malicioso",      value: "Malicious"       },
        ].map(f=>(
          <button key={f.value} className={`filter-btn${filter===f.value?" active":""}`}
            onClick={()=>{setFilter(f.value);setCurrentPage(1);}}>
            {f.label}
          </button>
        ))}
        <div className="doc-search">
          <span>🔍</span>
          <input placeholder="Buscar documento..." value={search} onChange={e=>{setSearch(e.target.value);setCurrentPage(1);}} />
        </div>
      </div>
      <div className="card">
        {rows.length === 0 && apiLoaded && !apiError ? (
          <div style={{padding:"48px 24px",textAlign:"center",color:"#94a3b8"}}>
            <div style={{fontSize:40,marginBottom:12}}>📂</div>
            <div style={{fontSize:15,fontWeight:600,color:"#475569"}}>No hay archivos en tu región</div>
            <div style={{fontSize:13,marginTop:6}}>Sube tu primer archivo ZIP desde la sección "Subir Archivo"</div>
          </div>
        ) : (
        <table>
          <thead>
            <tr><th>#</th><th>Nombre del archivo</th><th>Región</th><th>Propietario</th><th>Fecha</th><th>Hora</th><th>Tamaño</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {paginated.map((d,i)=>{
              const tz   = d.timezone || "UTC";
              const { date, time, ampm, tzLabel } = formatLocalDateTime(d.lastModified, tz);
              const chip = REGION_CHIP[d.country || d.countryCode || ""] || null;
              return (
                <tr key={i}>
                  <td style={{color:"#94a3b8"}}>{(currentPage-1)*PER_PAGE+i+1}</td>
                  <td><div className="td-file">📄 {d.name}</div></td>
                  <td>
                    {chip
                      ? <span style={{display:"inline-flex",alignItems:"center",gap:4,background:`${chip.color}18`,color:chip.color,borderRadius:6,padding:"2px 8px",fontSize:12,fontWeight:600}}>
                          {chip.flag} {chip.label}
                        </span>
                      : <span style={{color:"#94a3b8",fontSize:12}}>{d.countryName || "—"}</span>
                    }
                  </td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span className="owner-chip" style={{background:d.color||COLORS[i%COLORS.length]}}>
                        {(d.owner||d.countryName||"?").charAt(0)}
                      </span>
                      {d.owner || d.countryName}
                    </div>
                  </td>
                  <td>{date}</td>
                  <td style={{fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap"}}>
                    <span style={{color:"#1e293b",fontSize:13,fontWeight:600}}>{time}</span>
                    {" "}
                    <span style={{fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:4,
                      background:ampm==="AM"?"#dbeafe":"#fef3c7",
                      color:ampm==="AM"?"#1d4ed8":"#92400e"}}>{ampm}</span>
                    <span style={{fontSize:10,color:"#94a3b8",marginLeft:3}}>{tzLabel}</span>
                  </td>
                  <td>{d.size||"—"}</td>
                  <td><StatusPill s={d.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
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
function ReportesPage({ docs }: { docs: DocItem[] }) {

  // ── Calcular stats reales desde los docs del storage ──
  const total      = docs.length;
  const limpios    = docs.filter(d => d.status === "No threats found").length;
  const maliciosos = docs.filter(d => d.status === "Malicious").length;
  const sospechosos= docs.filter(d => d.status === "Suspicious").length;
  const sinEsc     = docs.filter(d => d.status === "Unscanned").length;
  const amenazas   = maliciosos + sospechosos;
  const tasaInfec  = total > 0 ? Math.round((amenazas / total) * 100) : 0;

  // ── Archivos maliciosos para el historial ──
  const historial = docs
    .filter(d => d.status === "Malicious" || d.status === "Suspicious")
    .slice(0, 20);

  // ── Detecciones por mes (últimos 6 meses) ──
  const now = new Date();
  const monthLabels: string[] = [];
  const monthCounts: number[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthLabels.push(d.toLocaleDateString("es-PE", { month: "short" }));
    const mn = d.getMonth(); const yr = d.getFullYear();
    monthCounts.push(
      docs.filter(doc => {
        if (doc.status !== "Malicious" && doc.status !== "Suspicious") return false;
        const dd = new Date(doc.lastModified);
        return dd.getMonth() === mn && dd.getFullYear() === yr;
      }).length
    );
  }
  const maxBar = Math.max(...monthCounts, 1);

  // ── Tipos de amenaza (solo Malicious vs Suspicious) ──
  const threats = [
    { label: "Malicioso",    color: "#ef4444", count: maliciosos,  pct: amenazas > 0 ? Math.round(maliciosos  / amenazas * 100) : 0 },
    { label: "Sospechoso",   color: "#f59e0b", count: sospechosos, pct: amenazas > 0 ? Math.round(sospechosos / amenazas * 100) : 0 },
  ].filter(t => t.count > 0);

  const stats = [
    { icon:"📄", num: total,           label:"Total analizados",    sub:"Todos los archivos",   color:"blue"   },
    { icon:"🔒", num: amenazas,        label:"Amenazas detectadas", sub:"Malicioso + Sospechoso",color:"red"   },
    { icon:"📊", num: `${tasaInfec}%`, label:"Tasa de infección",   sub:"Del total subido",     color:"orange" },
    { icon:"✅", num: limpios,         label:"Archivos limpios",    sub:"Sin amenazas",          color:"green"  },
  ];

  // ── Exportar PDF con datos reales ──
  const exportPDF = () => {
    const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W    = 210;
    const nowD = new Date();
    const generated = `${nowD.toLocaleDateString("es-PE",{year:"numeric",month:"long",day:"numeric"})} — ${nowD.toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}`;

    // Header
    doc.setFillColor(30,58,95); doc.rect(0,0,W,28,"F");
    doc.setTextColor(80,60,180); doc.setFontSize(20); doc.setFont("helvetica","bold"); doc.text("/",11,19);
    doc.setTextColor(80,60,180); doc.setFontSize(18); doc.text("blue",16,19);
    doc.setTextColor(210,70,30); doc.text("tab",34,19);
    doc.setFontSize(6); doc.setFont("helvetica","normal"); doc.setTextColor(200,200,200); doc.text("an IBM Company",11,23);
    doc.setFontSize(13); doc.setFont("helvetica","bold"); doc.setTextColor(255,255,255);
    doc.text("DocuColab — Reporte de Seguridad",W-10,13,{align:"right"});
    doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.text("Azure Defender · Análisis de Amenazas · Bluetab Solutions",W-10,19,{align:"right"});
    doc.setDrawColor(30,58,95); doc.setLineWidth(0.5); doc.line(10,32,W-10,32);
    doc.setFontSize(8); doc.setTextColor(100,116,139); doc.setFont("helvetica","italic");
    doc.text(`Generado el: ${generated}`,10,37);
    doc.text("Clasificación: Uso interno",W-10,37,{align:"right"});

    let y = 45;
    // Sección 1: Stats
    doc.setFillColor(241,245,249); doc.rect(10,y,W-20,7,"F");
    doc.setTextColor(30,58,95); doc.setFontSize(10); doc.setFont("helvetica","bold");
    doc.text("1. RESUMEN EJECUTIVO",13,y+5); y+=12;
    const bw = (W-20)/4;
    const sc: [number,number,number][] = [[219,234,254],[254,226,226],[255,251,235],[220,252,231]];
    const sb: [number,number,number][] = [[59,130,246],[220,38,38],[234,179,8],[22,163,74]];
    stats.forEach((s,i)=>{
      const bx=10+i*bw;
      doc.setFillColor(...sc[i]); doc.roundedRect(bx,y,bw-2,20,2,2,"F");
      doc.setDrawColor(...sb[i]); doc.setLineWidth(0.8); doc.line(bx,y,bx,y+20);
      doc.setTextColor(30,41,59); doc.setFontSize(14); doc.setFont("helvetica","bold");
      doc.text(String(s.num),bx+bw/2-1,y+10,{align:"center"});
      doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
      doc.text(s.label,bx+bw/2-1,y+16,{align:"center"});
    }); y+=26;

    // Sección 2: Detecciones por mes
    doc.setFillColor(241,245,249); doc.rect(10,y,W-20,7,"F");
    doc.setTextColor(30,58,95); doc.setFontSize(10); doc.setFont("helvetica","bold");
    doc.text("2. DETECCIONES POR MES",13,y+5); y+=12;
    const rL=(n:number)=>n===0?"Sin riesgo":n<=2?"Bajo":n<=5?"Medio":"Alto";
    const rC=(n:number):[number,number,number]=>n===0?[22,163,74]:n<=2?[234,179,8]:n<=5?[249,115,22]:[220,38,38];
    doc.setFillColor(30,58,95); doc.rect(10,y,W-24,7,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont("helvetica","bold");
    doc.text("Mes",13,y+5); doc.text("Detectados",43,y+5); doc.text("Nivel",83,y+5); y+=7;
    monthLabels.forEach((m,i)=>{
      doc.setFillColor(i%2===0?248:255,i%2===0?250:255,i%2===0?252:255);
      doc.rect(10,y,W-24,7,"F");
      doc.setTextColor(51,65,85); doc.setFont("helvetica","normal"); doc.setFontSize(8);
      doc.text(m,13,y+5); doc.text(String(monthCounts[i]),43,y+5);
      const [r2,g2,b2]=rC(monthCounts[i]);
      doc.setFillColor(r2,g2,b2); doc.roundedRect(80,y+1.5,28,4,1,1,"F");
      doc.setTextColor(255,255,255); doc.setFontSize(7);
      doc.text(rL(monthCounts[i]),94,y+5,{align:"center"}); y+=7;
    }); y+=6;

    // Sección 3: Historial de amenazas
    doc.setFillColor(241,245,249); doc.rect(10,y,W-20,7,"F");
    doc.setTextColor(30,58,95); doc.setFontSize(10); doc.setFont("helvetica","bold");
    doc.text("3. HISTORIAL DE AMENAZAS DETECTADAS",13,y+5); y+=12;
    const hH=["Archivo","Propietario","Fecha","Estado","Región"];
    const hW=[55,30,25,25,25];
    doc.setFillColor(30,58,95); doc.rect(10,y,hW.reduce((a,b)=>a+b,0)+6,7,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont("helvetica","bold");
    let cx2=13; hH.forEach((h,i2)=>{doc.text(h,cx2,y+5);cx2+=hW[i2];}); y+=7;
    historial.forEach((h,i)=>{
      if (y>270){doc.addPage();y=20;}
      doc.setFillColor(i%2===0?248:255,i%2===0?250:255,i%2===0?252:255);
      doc.rect(10,y,hW.reduce((a,b)=>a+b,0)+6,8,"F");
      doc.setTextColor(51,65,85); doc.setFont("helvetica","normal"); doc.setFontSize(7);
      cx2=13;
      const tz=h.timezone||"America/Lima";
      const {date}=formatLocalDateTime(h.lastModified,tz);
      [h.name,h.owner||"—",date].forEach((v,vi)=>{
        doc.text(doc.splitTextToSize(String(v),hW[vi]-2)[0],cx2,y+5);cx2+=hW[vi];
      });
      const isMal=h.status==="Malicious";
      doc.setFillColor(isMal?220:245,isMal?38:158,isMal?38:11);
      doc.roundedRect(cx2,y+1.5,22,4.5,1,1,"F");
      doc.setTextColor(255,255,255);
      doc.text(isMal?"Malicioso":"Sospechoso",cx2+11,y+5,{align:"center"}); cx2+=hW[3];
      const chip=REGION_CHIP[h.country||""];
      doc.setTextColor(51,65,85); doc.text(chip?chip.label:(h.countryName||"—"),cx2,y+5);
      y+=8;
    });

    // Footer
    const pH=297; doc.setFillColor(30,58,95); doc.rect(0,pH-14,W,14,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont("helvetica","normal");
    doc.text("/bluetab an IBM Company — DocuColab | Documento de uso interno",10,pH-7);
    doc.text(`Página 1  |  ${generated}`,W-10,pH-7,{align:"right"});
    doc.save(`reporte-defender-${nowD.toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div className="page-header" style={{margin:0}}>
          <h1>Reportes — Azure Defender</h1>
          <p>Análisis de amenazas en archivos subidos · {total} archivos en storage</p>
        </div>
        <button className="btn-pdf" onClick={exportPDF}>📄 Exportar PDF</button>
      </div>

      {/* Stats reales */}
      <div className="stats-grid" style={{marginBottom:20}}>
        {stats.map((s,i)=>(
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

      <div className="two-cols" style={{marginBottom:16}}>
        {/* Detecciones por mes */}
        <div className="card">
          <div className="card-header">
            <h3>Detecciones por mes</h3>
            <span style={{fontSize:11,color:"#94a3b8"}}>Últimos 6 meses</span>
          </div>
          <div className="card-body">
            {monthLabels.map((m,i)=>(
              <div className="report-bar-row" key={i}>
                <span className="report-bar-label">{m}</span>
                <div className="report-bar-wrap">
                  <div className="report-bar-fill" style={{
                    width: `${(monthCounts[i]/maxBar)*100}%`,
                    background: monthCounts[i]>4?"#ef4444":monthCounts[i]>1?"#f59e0b":"#22c55e"
                  }}/>
                </div>
                <span className="report-bar-count">{monthCounts[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tipos de amenaza */}
        <div className="card">
          <div className="card-header"><h3>Tipos de amenaza detectados</h3></div>
          <div className="card-body">
            {threats.length === 0 ? (
              <div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8"}}>
                <div style={{fontSize:32}}>✅</div>
                <div style={{fontSize:13,marginTop:8}}>No se detectaron amenazas</div>
              </div>
            ) : threats.map((t,i)=>(
              <div className="threat-type-row" key={i}>
                <div className="threat-dot" style={{background:t.color}}/>
                <span className="threat-label">{t.label}</span>
                <div className="threat-bar-wrap">
                  <div className="threat-bar-fill" style={{width:`${t.pct}%`,background:t.color}}/>
                </div>
                <span className="threat-count">{t.count} archivo{t.count!==1?"s":""}</span>
              </div>
            ))}
            {/* Archivos sin escanear */}
            {sinEsc > 0 && (
              <div className="threat-type-row" style={{marginTop:8,paddingTop:8,borderTop:"1px solid #f1f5f9"}}>
                <div className="threat-dot" style={{background:"#94a3b8"}}/>
                <span className="threat-label" style={{color:"#94a3b8"}}>Sin escanear</span>
                <div className="threat-bar-wrap">
                  <div className="threat-bar-fill" style={{width:`${total>0?Math.round(sinEsc/total*100):0}%`,background:"#cbd5e1"}}/>
                </div>
                <span className="threat-count" style={{color:"#94a3b8"}}>{sinEsc} archivo{sinEsc!==1?"s":""}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Historial de amenazas reales */}
      <div className="card">
        <div className="card-header">
          <h3>Historial de amenazas detectadas</h3>
          <span style={{fontSize:12,color:"#94a3b8"}}>{historial.length} registro{historial.length!==1?"s":""}</span>
        </div>
        {historial.length === 0 ? (
          <div style={{padding:"48px 24px",textAlign:"center",color:"#94a3b8"}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <div style={{fontSize:15,fontWeight:600,color:"#475569"}}>No se detectaron amenazas</div>
            <div style={{fontSize:13,marginTop:6}}>Todos los archivos escaneados están limpios</div>
          </div>
        ) : (
        <table>
          <thead>
            <tr>
              <th>Archivo</th><th>Propietario</th><th>Región</th>
              <th>Fecha</th><th>Hora</th><th>Tamaño</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((h,i)=>{
              const tz  = h.timezone || "America/Lima";
              const {date,time,ampm,tzLabel} = formatLocalDateTime(h.lastModified, tz);
              const chip = REGION_CHIP[h.country || ""];
              return (
                <tr key={i}>
                  <td><div className="td-file" style={{color:"#ef4444"}}>📄 {h.name}</div></td>
                  <td>{h.owner || "—"}</td>
                  <td>
                    {chip
                      ? <span style={{display:"inline-flex",alignItems:"center",gap:4,background:`${chip.color}18`,
                          color:chip.color,borderRadius:6,padding:"2px 8px",fontSize:12,fontWeight:600}}>
                          {chip.flag} {chip.label}
                        </span>
                      : <span style={{color:"#94a3b8"}}>{h.countryName || "—"}</span>
                    }
                  </td>
                  <td>{date}</td>
                  <td style={{fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>
                    <span style={{fontSize:13,fontWeight:600,color:"#1e293b"}}>{time}</span>{" "}
                    <span style={{fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:4,
                      background:ampm==="AM"?"#dbeafe":"#fef3c7",
                      color:ampm==="AM"?"#1d4ed8":"#92400e"}}>{ampm}</span>
                    <span style={{fontSize:10,color:"#94a3b8",marginLeft:3}}>{tzLabel}</span>
                  </td>
                  <td>{h.size || "—"}</td>
                  <td><StatusPill s={h.status}/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
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
  const [apiError, setApiError]   = useState<string>("");
  const [apiLoaded, setApiLoaded] = useState(false);

  // ── ROLES desde el id_token de Azure AD ──────────────────
  const roles: AppRole[]        = getRolesFromAccount(user);
  const isAdmin: boolean        = isAdminRole(roles);
  const allowedRegions: string[] = getAllowedRegions(roles);

  // Etiqueta de rol para la UI: muestra el rol más relevante
  const roleLabel: string = roles.length > 0
    ? ROLE_LABELS[
        roles.includes("AdminGlobal")      ? "AdminGlobal"      :
        roles.find(r => r.startsWith("Admin")) ??
        roles.find(r => r.startsWith("Upload")) ??
        roles[0]
      ] ?? "Sin rol"
    : "Sin rol asignado";

  // Si es UploadUser redirigir a "subir" por defecto
  useEffect(() => {
    if (!isAdmin && page !== "subir") setPage("subir");
  }, [isAdmin]);

  const fetchDocs = useCallback(async () => {
    try {
      // Pasar las regiones permitidas como query param para que el backend filtre
      const regionParam = allowedRegions.length > 0
        ? `?regions=${allowedRegions.join(",")}`
        : "";
      const r = await axios.get(`${API_BASE_URL}/documents${regionParam}`);
      setDocs(r.data.documents || []);
      setCountries(r.data.countries || []);
      setApiError("");
      setApiLoaded(true);
    } catch (e: any) {
      setApiError(e?.response?.data?.error || e?.message || "Error desconocido");
      setApiLoaded(true);
    }
  }, [allowedRegions.join(",")]);

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
        onLogout={() => instance.logoutRedirect({ postLogoutRedirectUri: "/" })}
        collapsed={collapsed} setCollapsed={setCollapsed}
        isAdmin={isAdmin} roleLabel={roleLabel}
      />
      <div className={`dash-main${collapsed?" collapsed":""}`}>
        <Topbar section={sections[page]} user={user} roleLabel={roleLabel} />
        <div className="content">
          {page==="inicio"     && isAdmin && <InicioPage docs={docs} onUpload={()=>setPage("subir")} userName={user?.name||"Usuario"} allowedRegions={allowedRegions} />}
          {page==="subir"      && <SubirPage docs={docs} countries={countries} onUploaded={fetchDocs} userName={user?.name||"Usuario"} userEmail={user?.username||""} isAdmin={isAdmin} allowedRegions={allowedRegions} />}
          {page==="documentos" && isAdmin && <DocumentosPage docs={docs} apiLoaded={apiLoaded} apiError={apiError} allowedRegions={allowedRegions} />}
          {page==="reportes"   && isAdmin && <ReportesPage docs={docs} />}
        </div>
      </div>
    </div>
  );
}
