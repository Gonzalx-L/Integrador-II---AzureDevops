import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API_BASE_URL } from "../authConfig";
import "./PipelineDiagram.css";

interface PipelineStatus {
  queues: Record<string, number>;
  segments: Record<string, boolean>;
  activeNodes: Record<string, boolean>;
  updatedAt: string;
}

interface Props {
  limpios: number;
  protegidos: number;
  errores: number;
  scanning: boolean;
}

const NODES: Record<string, { x: number; y: number; icon: string; label: string; color: string }> = {
  origen:        { x: 40,  y: 210, icon: "📁", label: "Fuente\nde origen",        color: "#f59e0b" },
  orchestrator:  { x: 150, y: 210, icon: "⚡", label: "Durable\nOrchestrator",    color: "#8b5cf6" },
  activity:      { x: 260, y: 210, icon: "⚡", label: "Durable\nExecutions",       color: "#8b5cf6" },
  storage:       { x: 370, y: 210, icon: "🗄️", label: "Storage\ntransferencia",   color: "#0ea5e9" },
  eventgrid:     { x: 460, y: 130, icon: "🛡️", label: "Azure\nDefender",          color: "#22c55e" },
  queueScan:     { x: 560, y: 210, icon: "📬", label: "queue-zip\n-scan",          color: "#6366f1" },
  classifier:    { x: 660, y: 210, icon: "⚡", label: "OnDefender\nScanResult",    color: "#8b5cf6" },
  queueLimpios:  { x: 760, y: 120, icon: "📬", label: "queue-zip\n-limpios",       color: "#6366f1" },
  fnLimpios:     { x: 860, y: 120, icon: "⚡", label: "OnClean\nZipFromQueue",     color: "#8b5cf6" },
  storageDest:   { x: 960, y: 120, icon: "🗄️", label: "documentos\nMENSUALES",    color: "#0ea5e9" },
  queueProt:     { x: 760, y: 210, icon: "📬", label: "queue-zip\n-protegidos",    color: "#6366f1" },
  keyVault:      { x: 860, y: 75,  icon: "🔐", label: "Key Vault\nkv-docucolab",   color: "#f59e0b" },
  fnProt:        { x: 860, y: 210, icon: "⚡", label: "OnProtected\nZipFromQueue", color: "#8b5cf6" },
  queueError:    { x: 760, y: 310, icon: "📬", label: "queue-zip\n-error",         color: "#6366f1" },
  fnError:       { x: 860, y: 310, icon: "⚡", label: "OnError\nZipFromQueue",     color: "#8b5cf6" },
  storageError:  { x: 960, y: 310, icon: "🗄️", label: "MENSUALES\nERROR",         color: "#ef4444" },
};

const EDGES: [string, string, string, string?][] = [
  ["origen",       "orchestrator",  "#8b5cf6"],
  ["orchestrator", "activity",      "#8b5cf6"],
  ["activity",     "storage",       "#0ea5e9"],
  ["storage",      "eventgrid",     "#22c55e", "curve"],
  ["eventgrid",    "queueScan",     "#22c55e", "curve"],
  ["storage",      "queueScan",     "#6366f1"],
  ["queueScan",    "classifier",    "#6366f1"],
  ["classifier",   "queueLimpios",  "#22c55e"],
  ["classifier",   "queueProt",     "#f59e0b"],
  ["classifier",   "queueError",    "#ef4444"],
  ["queueLimpios", "fnLimpios",     "#22c55e"],
  ["fnLimpios",    "storageDest",   "#22c55e"],
  ["queueProt",    "keyVault",      "#f59e0b", "curve"],
  ["keyVault",     "fnProt",        "#f59e0b", "curve"],
  ["queueProt",    "fnProt",        "#f59e0b"],
  ["queueError",   "fnError",       "#ef4444"],
  ["fnError",      "storageError",  "#ef4444"],
];

const SEGMENT_MAP: Record<string, string> = {
  "storage-eventgrid":       "storageToDefender",
  "eventgrid-queueScan":     "defenderToClassifier",
  "queueScan-classifier":    "defenderToClassifier",
  "classifier-queueLimpios": "classifierToLimpios",
  "classifier-queueProt":    "classifierToProtegidos",
  "classifier-queueError":   "classifierToError",
  "queueLimpios-fnLimpios":  "limpiosToStorage",
  "fnLimpios-storageDest":   "limpiosToStorage",
  "queueProt-keyVault":      "protegidosToKeyVault",
  "keyVault-fnProt":         "protegidosToKeyVault",
  "queueProt-fnProt":        "protegidosToKeyVault",
  "queueError-fnError":      "errorToFolder",
  "fnError-storageError":    "errorToFolder",
};

const ALWAYS_ACTIVE = ["origen-orchestrator","orchestrator-activity","activity-storage"];

function getPath(from: {x:number;y:number}, to: {x:number;y:number}, curve?: string): string {
  if (curve === "curve") {
    const mx = (from.x + to.x) / 2;
    const my = Math.min(from.y, to.y) - 45;
    return `M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`;
  }
  return `M${from.x},${from.y} L${to.x},${to.y}`;
}

function EdgeParticle({ x1,y1,x2,y2,color,delay,curve }: any) {
  const path = getPath({x:x1,y:y1},{x:x2,y:y2},curve);
  return (
    <circle r={5} fill={color} opacity={0.9}>
      <animateMotion dur="2s" begin={`${delay}s`} repeatCount="indefinite" path={path}/>
    </circle>
  );
}

export default function PipelineDiagram({ limpios, protegidos, errores, scanning }: Props) {
  const [status, setStatus] = useState<PipelineStatus | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await axios.get(`${API_BASE_URL}/status`);
      setStatus(r.data);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  const queueScan       = status?.queues.scan       ?? (scanning ? 1 : 0);
  const queueLimpios    = status?.queues.limpios     ?? limpios;
  const queueProtegidos = status?.queues.protegidos  ?? protegidos;
  const queueError      = status?.queues.error       ?? errores;

  const seg  = (key: string) => status?.segments[key]    ?? false;
  const node = (key: string) => status?.activeNodes[key] ?? false;

  const arrowId = (c: string) =>
    c==="#22c55e"?"arrow-green":c==="#f59e0b"?"arrow-orange":c==="#ef4444"?"arrow-red":c==="#6366f1"?"arrow-blue":"arrow-purple";

  return (
    <div className="pipeline-diagram-wrap">
      <div className="pipeline-diagram-header">
        <h3>📡 Flujo del Pipeline — Estado en tiempo real</h3>
        <div className="pipeline-legend">
          <span className="leg-item"><span style={{background:"#22c55e"}}/> Limpios: {queueLimpios}</span>
          <span className="leg-item"><span style={{background:"#f59e0b"}}/> Protegidos: {queueProtegidos}</span>
          <span className="leg-item"><span style={{background:"#ef4444"}}/> Errores: {queueError}</span>
          {queueScan > 0 && <span className="leg-item scanning"><span/> Escaneando: {queueScan}</span>}
          {status && <span style={{fontSize:10,color:"#94a3b8",marginLeft:8}}>⏱ {new Date(status.updatedAt).toLocaleTimeString("es-PE")}</span>}
        </div>
      </div>

      <div className="pipeline-svg-container">
        <svg viewBox="0 0 1020 400" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"auto"}}>
          <defs>
            {["purple","green","orange","red","blue"].map(n=>(
              <marker key={n} id={`arrow-${n}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={n==="purple"?"#8b5cf6":n==="green"?"#22c55e":n==="orange"?"#f59e0b":n==="red"?"#ef4444":"#6366f1"}/>
              </marker>
            ))}
          </defs>

          {/* Líneas */}
          {EDGES.map(([fk,tk,color,curve],i)=>{
            const f=NODES[fk], t=NODES[tk];
            return <path key={i} d={getPath({x:f.x+22,y:f.y},{x:t.x-22,y:t.y},curve)}
              stroke={color} strokeWidth={2} fill="none" strokeDasharray="5 3"
              markerEnd={`url(#${arrowId(color)})`} opacity={0.65}/>;
          })}

          {/* Partículas — solo en segmentos con mensajes reales */}
          {EDGES.map(([fk,tk,color,curve],i)=>{
            const segKey = `${fk}-${tk}`;
            const isActive = seg(SEGMENT_MAP[segKey]||"") || ALWAYS_ACTIVE.includes(segKey);
            if (!isActive) return null;
            const f=NODES[fk], t=NODES[tk];
            return <EdgeParticle key={`p-${i}`} x1={f.x+22} y1={f.y} x2={t.x-22} y2={t.y} color={color} delay={i*0.25} curve={curve}/>;
          })}

          {/* Nodos */}
          {(Object.entries(NODES)).map(([key,n])=>{
            const active = node(key);
            return (
              <g key={key} transform={`translate(${n.x-22},${n.y-22})`}>
                <rect width={44} height={44} rx={10} fill={n.color+"22"} stroke={n.color} strokeWidth={active?2.5:1.5} opacity={active?1:0.55}/>
                {active && (
                  <rect width={44} height={44} rx={10} fill="none" stroke={n.color} strokeWidth={4} opacity={0}>
                    <animate attributeName="opacity" values="0.35;0;0.35" dur="1.8s" repeatCount="indefinite"/>
                    <animate attributeName="strokeWidth" values="4;10;4"  dur="1.8s" repeatCount="indefinite"/>
                  </rect>
                )}
                <text x={22} y={28} textAnchor="middle" fontSize={20}>{n.icon}</text>
                {n.label.split("\n").map((line,li)=>(
                  <text key={li} x={22} y={56+li*13} textAnchor="middle" fontSize={9}
                    fill={active?"#1e293b":"#94a3b8"} fontWeight={active?600:400}>{line}</text>
                ))}
              </g>
            );
          })}

          {/* Contadores reales */}
          {[
            {x:940,y:100,count:queueLimpios,    bg:"#22c55e22",stroke:"#22c55e",text:"#16a34a"},
            {x:940,y:195,count:queueProtegidos,  bg:"#f59e0b22",stroke:"#f59e0b",text:"#b45309"},
            {x:940,y:295,count:queueError,       bg:"#ef444422",stroke:"#ef4444",text:"#dc2626"},
          ].map((c,i)=>(
            <g key={i}>
              <rect x={c.x} y={c.y} width={38} height={22} rx={6} fill={c.bg} stroke={c.stroke} strokeWidth={1.5}/>
              <text x={c.x+19} y={c.y+15} textAnchor="middle" fontSize={12} fill={c.text} fontWeight={700}>{c.count}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
