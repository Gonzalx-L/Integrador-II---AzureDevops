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
 *   sttransferenciaarchivos → transferencia-archivos → MENSUALES/BLUETAB_PERU/
 * con el estado real de Azure Defender por cada blob.
 *
 * GET /api/documents
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

  // Ruta fija según lineamiento del proyecto
  const containerName = process.env["CONTAINER_TRANSFERENCIA"] || "transferencia-archivos";
  const PREFIX        = "MENSUALES/BLUETAB_PERU/";

  try {
    const client          = getBlobServiceClient("STORAGE_TRANSFERENCIA_CONNECTION");
    const containerClient = client.getContainerClient(containerName);
    const documents: any[] = [];

    // Listar todos los blobs bajo MENSUALES/BLUETAB_PERU/
    for await (const blob of containerClient.listBlobsFlat({
      prefix: PREFIX,
      includeMetadata: true   // lee el metadata "uploader" guardado al subir
    })) {
      // Solo archivos .zip — ignorar subcarpetas y logs internos
      const rawName = blob.name.split("/").pop() ?? "";
      if (!rawName.toLowerCase().endsWith(".zip")) continue;

      // Quitar el prefijo UUID del nombre: "{uuid}_{nombre_original}.zip" → "{nombre_original}.zip"
      // Formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx_{nombre}.zip
      const name = rawName.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, "");

      // Pedir los tags individualmente — includeTags en listBlobsFlat
      // no siempre los retorna si Defender aún no los escribió.
      let tags: Record<string, string> | undefined;
      try {
        const blobClient = containerClient.getBlobClient(blob.name);
        const tagsResult = await blobClient.getTags();
        tags = tagsResult.tags;
      } catch {
        tags = undefined;
      }

      const defenderStatus = resolveDefenderStatus(tags);

      documents.push({
        name,
        path:         blob.name,
        country:      "PERU",
        countryName:  "Bluetab Solutions Peru",
        owner:        blob.metadata?.["uploader"] || "—",
        status:       defenderStatus,
        size:         formatSize(blob.properties.contentLength),
        lastModified: blob.properties.lastModified
      });
    }

    // Más reciente primero
    documents.sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );

    context.log(`GetDocuments: ${documents.length} archivos en ${containerName}/${PREFIX}`);

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        total: documents.length,
        documents,
        countries: COUNTRIES.map(c => ({ code: c.code, name: c.name }))
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
