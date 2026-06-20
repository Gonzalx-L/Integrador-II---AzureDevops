import AdmZip from "adm-zip";

export type ScanResult = "CLEAN" | "PROTECTED" | "ERROR";

export interface ScanReport {
  result: ScanResult;
  fileName: string;
  blobPath: string;
  countryCode: string;
  scannedAt: string;
  details: string;
  isPasswordProtected: boolean;
}

/**
 * Simula el escaneo de Azure Defender for Storage.
 *
 * En desarrollo (DEFENDER_MOCK=true): analiza el ZIP localmente con adm-zip.
 * En producción: Azure Defender publica el resultado real en la cola.
 *
 * Lógica del mock:
 * - Si el ZIP no se puede abrir sin contraseña → PROTECTED
 * - Si el ZIP contiene archivos con extensiones peligrosas (.exe, .bat, .ps1, etc.) → ERROR
 * - Si el ZIP está corrupto → ERROR
 * - En cualquier otro caso → CLEAN
 */
export async function scanZipBuffer(
  fileBuffer: Buffer,
  fileName: string,
  blobPath: string,
  countryCode: string
): Promise<ScanReport> {
  const scannedAt = new Date().toISOString();

  // Extensiones consideradas peligrosas
  const DANGEROUS_EXTENSIONS = [".exe", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".msi", ".dll", ".scr"];

  try {
    const zip = new AdmZip(fileBuffer);
    const entries = zip.getEntries();

    // Verificar si el ZIP está protegido con contraseña
    // adm-zip lanza error al intentar leer entradas protegidas
    let isPasswordProtected = false;

    for (const entry of entries) {
      if ((entry as any).header?.encripted || entry.getData().length === 0) {
        isPasswordProtected = true;
        break;
      }
    }

    if (isPasswordProtected) {
      return {
        result: "PROTECTED",
        fileName,
        blobPath,
        countryCode,
        scannedAt,
        details: "El archivo ZIP está protegido con contraseña. Se procesará via Key Vault.",
        isPasswordProtected: true
      };
    }

    // Verificar archivos peligrosos dentro del ZIP
    for (const entry of entries) {
      const entryName = entry.entryName.toLowerCase();
      const isDangerous = DANGEROUS_EXTENSIONS.some(ext => entryName.endsWith(ext));
      if (isDangerous) {
        return {
          result: "ERROR",
          fileName,
          blobPath,
          countryCode,
          scannedAt,
          details: `Archivo peligroso detectado dentro del ZIP: ${entry.entryName}`,
          isPasswordProtected: false
        };
      }
    }

    return {
      result: "CLEAN",
      fileName,
      blobPath,
      countryCode,
      scannedAt,
      details: `Escaneo completado. ${entries.length} archivos internos, todos seguros.`,
      isPasswordProtected: false
    };

  } catch (error: any) {
    // Si no se puede abrir el ZIP, verificar si es por contraseña o corrupción
    if (error.message?.includes("password") || error.message?.includes("encrypted")) {
      return {
        result: "PROTECTED",
        fileName,
        blobPath,
        countryCode,
        scannedAt,
        details: "ZIP protegido con contraseña detectado.",
        isPasswordProtected: true
      };
    }

    return {
      result: "ERROR",
      fileName,
      blobPath,
      countryCode,
      scannedAt,
      details: `Error al procesar el ZIP: ${error.message}`,
      isPasswordProtected: false
    };
  }
}
