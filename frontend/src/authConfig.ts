import type { Configuration, PopupRequest } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "346ab166-f55d-4e2a-942a-5e6a035bde73",
    authority: "https://login.microsoftonline.com/5552ca21-1b6a-4283-9e5f-f659668e7674",
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
};

export const loginRequest: PopupRequest = {
  // openid + profile son necesarios para obtener el id_token con roles
  scopes: ["openid", "profile", "User.Read"],
};

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://func-docucolab-dev.azurewebsites.net/api";

// ── Roles definidos en la App Registration de Azure AD ──────────────────────
export type AppRole =
  | "AdminGlobal"
  | "AdminPeru"
  | "AdminEspana"
  | "AdminArgentina"
  | "AdminNuevaZelanda"
  | "UploadUser"        // upload sin región específica (todas)
  | "UploadPeru"
  | "UploadEspana"
  | "UploadArgentina"
  | "UploadNuevaZelanda";

/** Regiones a las que tiene acceso cada rol */
export const ROLE_REGIONS: Record<AppRole, string[]> = {
  AdminGlobal:         ["PERU", "ESPANA", "ARGENTINA", "NUEVA_ZELANDA"],
  AdminPeru:           ["PERU"],
  AdminEspana:         ["ESPANA"],
  AdminArgentina:      ["ARGENTINA"],
  AdminNuevaZelanda:   ["NUEVA_ZELANDA"],
  UploadUser:          ["PERU", "ESPANA", "ARGENTINA", "NUEVA_ZELANDA"], // sin restricción
  UploadPeru:          ["PERU"],
  UploadEspana:        ["ESPANA"],
  UploadArgentina:     ["ARGENTINA"],
  UploadNuevaZelanda:  ["NUEVA_ZELANDA"],
};

/** Extrae los roles del id_token (claim "roles") */
export function getRolesFromAccount(account: any): AppRole[] {
  return (account?.idTokenClaims?.roles as AppRole[]) ?? [];
}

/** Regiones visibles para un conjunto de roles */
export function getAllowedRegions(roles: AppRole[]): string[] {
  const regions = new Set<string>();
  for (const role of roles) {
    (ROLE_REGIONS[role] ?? []).forEach(r => regions.add(r));
  }
  return Array.from(regions);
}

/** ¿Tiene al menos un rol de administrador (acceso a docs/reportes)? */
export function isAdminRole(roles: AppRole[]): boolean {
  const adminRoles: AppRole[] = ["AdminGlobal","AdminPeru","AdminEspana","AdminArgentina","AdminNuevaZelanda"];
  return roles.some(r => adminRoles.includes(r));
}

/** Etiqueta amigable para mostrar en UI */
export const ROLE_LABELS: Record<AppRole, string> = {
  AdminGlobal:        "Admin Global",
  AdminPeru:          "Admin Perú",
  AdminEspana:        "Admin España",
  AdminArgentina:     "Admin Argentina",
  AdminNuevaZelanda:  "Admin Nueva Zelanda",
  UploadUser:         "Colaborador",
  UploadPeru:         "Colaborador Perú",
  UploadEspana:       "Colaborador España",
  UploadArgentina:    "Colaborador Argentina",
  UploadNuevaZelanda: "Colaborador Nueva Zelanda",
};
