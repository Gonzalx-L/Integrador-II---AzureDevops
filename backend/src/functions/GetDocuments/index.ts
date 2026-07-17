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
 * Lee el tag "Malware Scanning Result" que Defender escribe en el blob.
 * Si no existe (Defender no habilitado o blob muy reciente) → "Unscanned".
 */
function resolveDefenderStatus(
  tags: Record<string, string> | undefined
): DefenderStatus {
  const result = tags?.["Malware Scanning Result"];
  if (result) return result as DefenderStatus;
  return "Unscanned";
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
      // Prefijo raíz de la región: {storagePath}/
      const PREFIX = `${country.storagePath}/`;

      for await (const blob of containerClient.listBlobsFlat({
        prefix: PREFIX,
        includeMetadata: true
      })) {
        const rawName = blob.name.split("/").pop() ?? "";
        if (!rawName.toLowerCase().endsWith(".zip")) continue;

        // Ignorar subcarpeta DESBLOQUEADOS — solo mostrar archivos originales subidos
        if (blob.name.includes("/DESBLOQUEADOS/")) continue;

        // Quitar el prefijo UUID del nombre
        const name = rawName.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, "");

        // Extraer carpeta de fecha de la ruta: {storagePath}/{DD-MM-YYYY}/{uuid}_archivo.zip
        // pathParts[0] = storagePath, pathParts[1] = DD-MM-YYYY, pathParts[2] = archivo
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

        const defenderStatus = resolveDefenderStatus(tags);

        // Leer metadata guardada al subir — fuente de verdad para hora y región
        const uploadedAt  = blob.metadata?.["uploadedat"]  || blob.properties.lastModified?.toISOString() || "";
        const tzFromMeta  = blob.metadata?.["timezone"]    || country.timezone;
        const ccFromMeta  = blob.metadata?.["countrycode"] || country.code;

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
          // uploadedAt del metadata = momento exacto de subida en UTC
          // lastModified = fallback si es un blob antiguo sin metadata
          lastModified: uploadedAt,
        });
      }
    }

    // Más reciente primero
    documents.sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );

    context.log(`GetDocuments: ${documents.length} archivos — regiones: ${countriesToQuery.map(c => c.code).join(", ")}`);

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        total: documents.length,
        documents,
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
