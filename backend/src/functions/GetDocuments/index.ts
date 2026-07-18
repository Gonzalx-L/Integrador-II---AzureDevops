import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getBlobServiceClient } from "../../utils/blobHelper";
import { COUNTRIES } from "../../config/countries";

/**
 * Estados reales de Azure Defender for Storage.
 * Defender escribe este valor en el tag del blob: "Malware Scanning Result"
 *
 *   "No threats found"  → escaneo completado, limpio
 *   "Malicious"         → amenaza confirmada
 *   "Suspicious"        → comportamiento sospechoso
 *   "Scanning"          → Defender escaneando ahora
 *   "Unscanned"         → blob recién subido, aún no procesado
 */
type DefenderStatus =
  | "No threats found"
  | "Malicious"
  | "Suspicious"
  | "Scanning"
  | "Unscanned";

/**
 * Nombres de archivo que simulan ser maliciosos en modo DEFENDER_MOCK.
 * Case-insensitive, se compara contra el nombre limpio sin UUID.
 */
const MOCK_MALICIOUS_NAMES = ["pruebaantony", "reportegonzalo", "ventas123"];

/**
 * Resuelve el estado de Defender para un blob.
 *
 * Modo real  (DEFENDER_MOCK !== "true"):
 *   Lee el tag "Malware Scanning Result" del blob. Si no existe → "Unscanned".
 *
 * Modo mock (DEFENDER_MOCK === "true"):
 *   Simula el comportamiento de Defender basado en el tiempo transcurrido:
 *   - Si subió hace menos de DEFENDER_MOCK_DELAY segundos → "Unscanned"
 *   - Si subió hace más del delay:
 *       · Nombre contiene PruebaAntony/ReporteGonzalo/Ventas123 → "Malicious"
 *       · Cualquier otro → "No threats found"
 */
function resolveDefenderStatus(
  tags:        Record<string, string> | undefined,
  uploadedAt:  string,
  blobName:    string
): DefenderStatus {
  // Modo real — leer el tag
  if (process.env["DEFENDER_MOCK"] !== "true") {
    const result = tags?.["Malware Scanning Result"];
    return result ? (result as DefenderStatus) : "Unscanned";
  }

  // Modo mock — simular con lógica temporal
  const delaySeconds = parseInt(process.env["DEFENDER_MOCK_DELAY"] || "10");
  const uploadedMs   = uploadedAt ? new Date(uploadedAt).getTime() : 0;
  const elapsedSec   = uploadedMs > 0
    ? (Date.now() - uploadedMs) / 1000
    : delaySeconds + 1; // si no hay fecha, asumir ya escaneado

  if (elapsedSec < delaySeconds) {
    return "Unscanned";
  }

  // Pasado el delay: verificar si el nombre es de los maliciosos
  const rawName   = blobName.split("/").pop() ?? "";
  const cleanName = rawName
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, "")
    .replace(/\.zip$/i, "")
    .toLowerCase();

  const isMalicious = MOCK_MALICIOUS_NAMES.some(n => cleanName.includes(n));
  return isMalicious ? "Malicious" : "No threats found";
}

/**
 * Formatea bytes a representación legible (KB / MB).
 */
function formatSize(bytes: number | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * GetDocuments — HTTP Trigger
 * Retorna el historial de archivos ZIP en:
 *   sttransferenciaarchivos → transferencia-archivos → MENSUALES/{PAIS}/
 * con el estado real de Azure Defender por cada blob.
 *
 * GET /api/documents?regions=PERU,ESPANA  (opcional — filtra por región)
 * GET /api/documents                       (sin filtro → devuelve todo)
 */
export async function getDocuments(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  // Leer el query param "regions" para filtrar por país
  const regionsParam = request.query.get("regions");
  const allowedRegions: string[] = regionsParam
    ? regionsParam.split(",").map(r => r.trim().toUpperCase()).filter(Boolean)
    : [];

  // Si hay regiones permitidas filtrar; si no, retornar todos los países
  const countriesToQuery = allowedRegions.length > 0
    ? COUNTRIES.filter(c => allowedRegions.includes(c.code))
    : COUNTRIES;

  const containerName = process.env["CONTAINER_TRANSFERENCIA"] || "transferencia-archivos";

  try {
    const client          = getBlobServiceClient("STORAGE_TRANSFERENCIA_CONNECTION");
    const containerClient = client.getContainerClient(containerName);
    const documents: any[] = [];

    // Iterar sobre cada país permitido
    for (const country of countriesToQuery) {
      const PREFIXES = [
        `MENSUALES/${country.storagePath}/`,
        `${country.storagePath}/`,
      ];

      for (const PREFIX of PREFIXES) {
      for await (const blob of containerClient.listBlobsFlat({
        prefix: PREFIX,
        includeMetadata: true
      })) {
        const rawName = blob.name.split("/").pop() ?? "";
        if (!rawName.toLowerCase().endsWith(".zip")) continue;

        // Ignorar subcarpeta DESBLOQUEADOS
        if (blob.name.includes("/DESBLOQUEADOS/")) continue;

        // Ignorar archivos en ERROR — se muestran por su entrada en MENSUALES/ERROR/
        // pero NO queremos el duplicado del original en BLUETAB_*/fecha/
        // Regla: si existe una copia en MENSUALES/ (procesado), el original se omite.
        // Lo resolvemos con deduplicación por nombre limpio al final.

        const name = rawName.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, "");
        const pathParts  = blob.name.split("/");
        const dateFolder = pathParts.length >= 2 ? pathParts[1] : "—";

        let tags: Record<string, string> | undefined;
        try {
          const blobClient = containerClient.getBlobClient(blob.name);
          const tagsResult = await blobClient.getTags();
          tags = tagsResult.tags;
        } catch {
          tags = undefined;
        }

        const uploadedAt = blob.metadata?.["uploadedat"] || blob.properties.lastModified?.toISOString() || "";
        const tzFromMeta = blob.metadata?.["timezone"]   || country.timezone;
        const ccFromMeta = blob.metadata?.["countrycode"]|| country.code;

        const defenderStatus = resolveDefenderStatus(tags, uploadedAt, blob.name);

        // Marcar si es la copia "final" (ya procesada en MENSUALES/)
        // vs el original recién subido (en BLUETAB_*/fecha/)
        const isFinalCopy = blob.name.startsWith("MENSUALES/");

        documents.push({
          name,
          path:         blob.name,
          country:      ccFromMeta,
          countryCode:  ccFromMeta,
          countryName:  country.name,
          timezone:     tzFromMeta,
          dateFolder,
          owner:        blob.metadata?.["uploader"] || "—",
          status:       defenderStatus,
          size:         formatSize(blob.properties.contentLength),
          lastModified: uploadedAt,
          isFinalCopy,  // usado para deduplicar abajo
        });
      }
      } // fin for PREFIXES
    } // fin for countriesToQuery

    // ── Deduplicación ────────────────────────────────────────────────────
    // Si un archivo tiene versión en MENSUALES/ (isFinalCopy=true),
    // eliminar el duplicado del prefijo original (isFinalCopy=false).
    const finalNames = new Set(
      documents.filter(d => d.isFinalCopy).map(d => d.name.toLowerCase())
    );
    const deduplicated = documents.filter(d =>
      d.isFinalCopy || !finalNames.has(d.name.toLowerCase())
    );
    // Quitar el campo auxiliar antes de responder
    deduplicated.forEach(d => delete d.isFinalCopy);

    // Ordenar por fecha descendente (más recientes primero)
    deduplicated.sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );

    context.log(`GetDocuments: ${deduplicated.length} archivos (${documents.length} total antes de deduplicar) — regiones: ${countriesToQuery.map(c => c.code).join(", ")}`);

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        total: deduplicated.length,
        documents: deduplicated,
        countries: countriesToQuery.map(c => ({ code: c.code, name: c.name }))
      }
    };

  } catch (error: any) {
    context.error(`Error en GetDocuments: ${error.message}`);
    return {
      status: 500,
      headers: corsHeaders,
      jsonBody: { error: `Error interno: ${error.message}` }
    };
  }
}

app.http("GetDocuments", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "documents",
  handler: getDocuments
});
