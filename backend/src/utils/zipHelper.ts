import AdmZip from "adm-zip";

/**
 * Desbloquea un ZIP protegido con contraseña y retorna el contenido descomprimido
 * como un nuevo ZIP limpio (sin contraseña).
 */
export function unlockAndRepackZip(encryptedBuffer: Buffer, password: string): Buffer {
  const zip = new AdmZip(encryptedBuffer);
  const entries = zip.getEntries();

  // Crear un nuevo ZIP limpio
  const cleanZip = new AdmZip();

  for (const entry of entries) {
    if (!entry.isDirectory) {
      // Extraer con contraseña
      const content = zip.readFile(entry, password);
      if (content) {
        cleanZip.addFile(entry.entryName, content);
      }
    }
  }

  return cleanZip.toBuffer();
}

/**
 * Lista los archivos dentro de un ZIP.
 */
export function listZipContents(zipBuffer: Buffer): string[] {
  const zip = new AdmZip(zipBuffer);
  return zip.getEntries()
    .filter(e => !e.isDirectory)
    .map(e => e.entryName);
}

/**
 * Extrae todos los archivos de un ZIP y los retorna como un mapa nombre→contenido.
 */
export function extractZipFiles(zipBuffer: Buffer): Map<string, Buffer> {
  const zip = new AdmZip(zipBuffer);
  const files = new Map<string, Buffer>();

  for (const entry of zip.getEntries()) {
    if (!entry.isDirectory) {
      const content = entry.getData();
      files.set(entry.entryName, content);
    }
  }

  return files;
}

/**
 * Crea un ZIP nuevo a partir de un mapa de archivos.
 */
export function createZipFromFiles(files: Map<string, Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of files) {
    zip.addFile(name, content);
  }
  return zip.toBuffer();
}
