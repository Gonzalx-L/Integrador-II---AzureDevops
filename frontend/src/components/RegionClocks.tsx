import { useState, useEffect } from "react";
import "./RegionClocks.css";

interface ClockConfig {
  code: string;
  label: string;
  timezone: string;
  flag: string;
}

// Configuración de relojes por región — alineada con countries.ts del backend
const ALL_CLOCKS: ClockConfig[] = [
  { code: "PERU",          label: "Perú",          timezone: "America/Lima",                       flag: "🇵🇪" },
  { code: "ESPANA",        label: "España",         timezone: "Europe/Madrid",                      flag: "🇪🇸" },
  { code: "ARGENTINA",     label: "Argentina",      timezone: "America/Argentina/Buenos_Aires",     flag: "🇦🇷" },
  { code: "NUEVA_ZELANDA", label: "Nueva Zelanda",  timezone: "Pacific/Auckland",                   flag: "🇳🇿" },
];

function useTime(timezone: string) {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const tick = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  const formatter = new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone,
    hour:     "2-digit",
    minute:   "2-digit",
    second:   "2-digit",
    hour12:   false,
  });

  const dateFormatter = new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone,
    weekday: "short",
    day:     "2-digit",
    month:   "short",
  });

  return {
    time: formatter.format(time),
    date: dateFormatter.format(time),
  };
}

function SingleClock({ clock }: { clock: ClockConfig }) {
  const { time, date } = useTime(clock.timezone);
  const [hh, mm, ss] = time.split(":");

  // Calcular ángulos para las agujas del reloj analógico
  const h = parseInt(hh) % 12;
  const m = parseInt(mm);
  const s = parseInt(ss);
  const secDeg  = s * 6;
  const minDeg  = m * 6 + s * 0.1;
  const hourDeg = h * 30 + m * 0.5;

  return (
    <div className="clock-card">
      <div className="clock-header">
        <span className="clock-flag">{clock.flag}</span>
        <div className="clock-region">
          <span className="clock-label">{clock.label}</span>
          <span className="clock-date">{date}</span>
        </div>
      </div>

      {/* Reloj analógico */}
      <div className="clock-face">
        {/* Marcas de horas */}
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="clock-mark"
            style={{ transform: `rotate(${i * 30}deg) translateY(-38px)` }}
          />
        ))}
        {/* Aguja de horas */}
        <div className="clock-hand hour-hand" style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)` }} />
        {/* Aguja de minutos */}
        <div className="clock-hand min-hand"  style={{ transform: `translateX(-50%) rotate(${minDeg}deg)` }} />
        {/* Aguja de segundos */}
        <div className="clock-hand sec-hand"  style={{ transform: `translateX(-50%) rotate(${secDeg}deg)` }} />
        {/* Centro */}
        <div className="clock-center" />
      </div>

      {/* Hora digital */}
      <div className="clock-digital">
        <span className="clock-hhmm">{hh}:{mm}</span>
        <span className="clock-ss">{ss}</span>
      </div>
    </div>
  );
}

interface RegionClocksProps {
  /** Regiones permitidas para este usuario. Vacío = todas (AdminGlobal). */
  allowedRegions: string[];
}

export default function RegionClocks({ allowedRegions }: RegionClocksProps) {
  const clocks = allowedRegions.length > 0
    ? ALL_CLOCKS.filter(c => allowedRegions.includes(c.code))
    : ALL_CLOCKS;

  return (
    <div className="region-clocks-wrap">
      <div className="region-clocks-title">🕐 Hora en tiempo real por región</div>
      <div className={`region-clocks-grid clocks-${clocks.length}`}>
        {clocks.map(c => <SingleClock key={c.code} clock={c} />)}
      </div>
    </div>
  );
}
