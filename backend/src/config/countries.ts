// Configuración de países y zonas horarias para Bluetab Solutions
// Hora local de ejecución del pipeline: 08:00 en cada sede

export interface CountryConfig {
  code: string;
  name: string;
  timezone: string;       // IANA timezone name
  executionHour: number;  // Hora local en que se ejecuta el pipeline (24h)
  storagePath: string;    // Ruta en Blob Storage
}

export const COUNTRIES: CountryConfig[] = [
  {
    code: "PERU",
    name: "Bluetab Solutions Peru",
    timezone: "America/Lima",
    executionHour: 8,
    storagePath: "BLUETAB_PERU"
  },
  {
    code: "ESPANA",
    name: "Bluetab Solutions Espana",
    timezone: "Europe/Madrid",
    executionHour: 8,
    storagePath: "BLUETAB_ESPANA"
  },
  {
    code: "ARGENTINA",
    name: "Bluetab Solutions Argentina",
    timezone: "America/Argentina/Buenos_Aires",
    executionHour: 8,
    storagePath: "BLUETAB_ARGENTINA"
  },
  {
    code: "NUEVA_ZELANDA",
    name: "Bluetab Solutions Nueva Zelanda",
    timezone: "Pacific/Auckland",
    executionHour: 8,
    storagePath: "BLUETAB_NUEVA_ZELANDA"
  }
];

export const getCountryByCode = (code: string): CountryConfig | undefined => {
  return COUNTRIES.find(c => c.code === code);
};
