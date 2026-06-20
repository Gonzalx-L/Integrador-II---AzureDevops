import { DateTime } from "luxon";
import { COUNTRIES, CountryConfig } from "../config/countries";

/**
 * Retorna los países cuya hora local actual coincide con la hora de ejecución configurada.
 * Esto permite que el Timer Trigger (que corre en UTC) dispare el pipeline
 * solo para los países que corresponden en ese momento.
 */
export function getCountriesToProcess(): CountryConfig[] {
  const nowUtc = DateTime.utc();

  return COUNTRIES.filter(country => {
    const localTime = nowUtc.setZone(country.timezone);
    return localTime.hour === country.executionHour && localTime.minute < 5;
  });
}

/**
 * Retorna la hora local actual de un país dado su código.
 */
export function getLocalTime(countryCode: string): string {
  const country = COUNTRIES.find(c => c.code === countryCode);
  if (!country) return "País no encontrado";
  return DateTime.utc().setZone(country.timezone).toFormat("yyyy-MM-dd HH:mm:ss ZZZZ");
}

/**
 * Verifica si un país debe ejecutar el pipeline ahora.
 */
export function shouldProcessCountry(countryCode: string): boolean {
  const country = COUNTRIES.find(c => c.code === countryCode);
  if (!country) return false;
  const localTime = DateTime.utc().setZone(country.timezone);
  return localTime.hour === country.executionHour && localTime.minute < 5;
}
