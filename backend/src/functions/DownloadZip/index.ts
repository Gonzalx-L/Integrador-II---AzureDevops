import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential
} from "@azure/storage-blob";

/**
 * DownloadZip — HTTP Trigger
 * Genera una URL SAS temporal (5 min) para descarga directa desde Azure Storage.
 * El navegador descarga el archivo directo desde Azure, sin pasar por el backend.
 *
 * GET /api/download?path=MENSUALES/BLUETAB_PERU/{uuid}_archivo.zip
 * Responde: { sasUrl: "https://..." }
 */
export async function downloadZip(
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

  const blobPath = request.query.get("path");

  if (!blobPath) {
    return { status: 400, headers: corsHeaders, jsonBody: { error: "Parámetro 'path' requerido." } };
  }

  // Seguridad: solo rutas dentro de MENSUALES/ o BLUETAB_{PAIS}/
  const VALID_PREFIXES = ["MENSUALES/", "BLUETAB_PERU/", "BLUETAB_ESPANA/", "BLUETAB_ARGENTINA/", "BLUETAB_NUEVA_ZELANDA/"];
  if (!VALID_PREFIXES.some(p => blobPath.startsWith(p))) {
    return { status: 403, headers: corsHeaders, jsonBody: { error: "Ruta no permitida." } };
  }

  const connectionString = process.env["STORAGE_TRANSFERENCIA_CONNECTION"] || "";
  const containerName    = process.env["CONTAINER_TRANSFERENCIA"] || "transferencia-archivos";

  try {
    // Parsear account name y key desde la connection string
    const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
    const accountKeyMatch  = connectionString.match(/AccountKey=([^;]+)/);

    if (!accountNameMatch || !accountKeyMatch) {
      throw new Error("No se pudo parsear la connection string del storage.");
    }

    const accountName = accountNameMatch[1];
    const accountKey  = accountKeyMatch[1];

    // Verificar que el blob existe
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient   = blobServiceClient.getContainerClient(containerName);
    const blobClient        = containerClient.getBlobClient(blobPath);

    const exists = await blobClient.exists();
    if (!exists) {
      return { status: 404, headers: corsHeaders, jsonBody: { error: "Archivo no encontrado." } };
    }

    // Nombre limpio sin UUID para el header de descarga
    const rawName   = blobPath.split("/").pop() ?? "archivo.zip";
    const cleanName = rawName.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, "");

    // Generar SAS válido por 5 minutos
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const expiresOn           = new Date(Date.now() + 5 * 60 * 1000); // +5 min

    const sasQuery = generateBlobSASQueryParameters(
      {
        containerName,
        blobName:           blobPath,
        permissions:        BlobSASPermissions.parse("r"), // solo lectura
        expiresOn,
        contentDisposition: `attachment; filename="${cleanName}"`,
        contentType:        "application/zip"
      },
      sharedKeyCredential
    ).toString();

    const sasUrl = `${blobClient.url}?${sasQuery}`;

    context.log(`DownloadZip SAS generado para: ${blobPath}`);

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { sasUrl, fileName: cleanName }
    };

  } catch (error: any) {
    context.error(`Error en DownloadZip: ${error.message}`);
    return {
      status: 500,
      headers: corsHeaders,
      jsonBody: { error: `Error interno: ${error.message}` }
    };
  }
}

app.http("DownloadZip", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "download",
  handler: downloadZip
});
