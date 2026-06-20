import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../authConfig";
import "./LoginPage.css";

export default function LoginPage() {
  const { instance } = useMsal();

  const handleLogin = async () => {
    try {
      await instance.loginRedirect(loginRequest);
    } catch (err) {
      console.error("Error en login:", err);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-card">

        {/* IZQUIERDA */}
        <div className="login-left">
          <svg className="login-illustration" viewBox="0 0 300 240" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="60" y="60" width="180" height="120" rx="12" fill="#1e3a5f" opacity="0.12"/>
            <rect x="68" y="68" width="164" height="104" rx="8" fill="#1e3a5f" opacity="0.2"/>
            <rect x="76" y="76" width="148" height="88" rx="6" fill="white" opacity="0.9"/>
            <rect x="90" y="86" width="60" height="72" rx="4" fill="#e3f2fd"/>
            <rect x="96" y="94" width="48" height="4" rx="2" fill="#1e3a5f" opacity="0.5"/>
            <rect x="96" y="102" width="36" height="3" rx="1.5" fill="#90caf9"/>
            <rect x="96" y="109" width="40" height="3" rx="1.5" fill="#90caf9"/>
            <rect x="96" y="116" width="32" height="3" rx="1.5" fill="#90caf9"/>
            <circle cx="200" cy="106" r="22" fill="#ff9800" opacity="0.15"/>
            <rect x="192" y="108" width="16" height="12" rx="3" fill="#ff9800"/>
            <path d="M193 108 v-5 a7 7 0 0 1 14 0 v5" stroke="#ff9800" strokeWidth="2.5" fill="none"/>
            <circle cx="240" cy="60" r="16" fill="#4caf50" opacity="0.2"/>
            <rect x="50" y="100" width="18" height="18" rx="4" fill="#e91e63" opacity="0.2"/>
            <circle cx="70" cy="160" r="10" fill="#9c27b0" opacity="0.2"/>
            <circle cx="185" cy="155" r="14" fill="#ffb74d"/>
            <path d="M165 185 q20-18 40 0" fill="#1e3a5f" opacity="0.7"/>
          </svg>
          <p className="login-tagline">Gestión documental colaborativa</p>
        </div>

        {/* DERECHA */}
        <div className="login-right">
          <div className="login-brand">
            <div className="login-brand-icon">📁</div>
            <span className="login-brand-name">DocuColab</span>
          </div>

          <h2>Bienvenido</h2>
          <p>Inicia sesión con tu cuenta corporativa de Bluetab Solutions para acceder al sistema.</p>

          <button className="btn-microsoft" onClick={handleLogin}>
            <img
              src="https://learn.microsoft.com/en-us/azure/active-directory/develop/media/howto-add-branding-in-apps/ms-symbollockup_mssymbol_19.png"
              alt="Microsoft" width={20} height={20}
            />
            Continuar con Microsoft
          </button>

          <p className="login-access-note">
            Acceso exclusivo para colaboradores de{" "}
            <a href="#">Bluetab Solutions</a>
          </p>
        </div>

      </div>
    </div>
  );
}
