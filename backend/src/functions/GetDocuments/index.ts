import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getBlobServiceClient } from "../../utils/blobHelper";
import { COUNTRIES } from "../../config/countries";

/**
 * GetDocuments — HTTP Trigger
 * Endpoint para que el dashboard consulte los documentos procesados.
 * Retorna la lista de archivos en el storage con su estado.
 *
 * GET /api/documents?country=PERU
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

  const countryFilter = request.query.get("country") || null;
  const containerTransferencia = process.env["CONTAINER_TRANSFERENCIA"] || "transferencia-archivos";
  const containerDocumentos = process.env["CONTAINER_DOCUMENTOS"] || "documentos";

  try {
    const documents: any[] = [];
    const clientTransferencia = getBlobServiceClient("STORAGE_TRANSFERENCIA_CONNECTION");
    const clientDocumentos = getBlobServiceClient("STORAGE_DOCUMENTOS_CONNECTION");

    const countriesToList = countryFilter
      ? COUNTRIES.filter(c => c.code === countryFilter)
      : COUNTRIES;

    for (const country of countriesToList) {
      // Archivos en DESBLOQUEADOS (procesados limpios)
      const containerClientT = clientTransferencia.getContainerClient(containerTransferencia);
      const prefixDesbloqueados = `MENSUALES/${country.storagePath}/DESBLOQUEADOS/`;

      for await (const blob of containerClientT.listBlobsFlat({ prefix: prefixDesbloqueados })) {
        if (blob.name.endsWith(".zip")) {
          documents.push({
            name: blob.name.split("/").pop(),
            path: blob.name,
            country: country.code,
            countryName: country.name,
            status: "LIMPIO",
            size: blob.properties.contentLength,
            lastModified: blob.properties.lastModified
          });
        }
      }

      // Archivos en ERROR
      const prefixError = `MENSUALES/${country.storagePath}/ERROR/`;
      for await (const blob of containerClientT.listBlobsFlat({ prefix: prefixError })) {
        if (blob.name.endsWith(".zip")) {
          documents.push({
            name: blob.name.split("/").pop(),
            path: blob.name,
            country: country.code,
            countryName: country.name,
            status: "ERROR",
            size: blob.properties.contentLength,
            lastModified: blob.properties.lastModified
          });
        }
      }

      // Archivos en documentos finales (procesados completos)
      const containerClientD = clientDocumentos.getContainerClient(containerDocumentos);
      const prefixDocumentos = `${country.storagePath}/MENSUALES/`;

      for await (const blob of containerClientD.listBlobsFlat({ prefix: prefixDocumentos })) {
        if (blob.name.endsWith(".zip")) {
          documents.push({
            name: blob.name.split("/").pop(),
            path: blob.name,
            country: country.code,
            countryName: country.name,
            status: "PROCESADO",
            size: blob.properties.contentLength,
            lastModified: blob.properties.lastModified
          });
        }
      }
    }

    // Ordenar por fecha descendente
    documents.sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );

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
