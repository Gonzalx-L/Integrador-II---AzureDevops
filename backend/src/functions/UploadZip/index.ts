import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { uploadBlob } from "../../utils/blobHelper";
import { sendQueueMessage } from "../../utils/queueHelper";
import { COUNTRIES } from "../../config/countries";
import { v4 as uuidv4 } from "uuid";

/**
 * UploadZip — HTTP Trigger
 * Endpoint para que el frontend suba archivos ZIP.
 * Recibe el archivo multipart, lo guarda en Blob Storage
 * y encola un mensaje en queue-zip-scan para disparar el escaneo.
 *
 * POST /api/upload
 * Body: multipart/form-data con campos:
 *   - file: archivo ZIP
 *   - countryCode: código del país (PERU, ESPAÑA, ARGENTINA, NUEVA_ZELANDA)
 */
export async function uploadZip(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("UploadZip endpoint invocado");

  // Headers CORS para el frontend
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as (Blob & { name: string; arrayBuffer(): Promise<ArrayBuffer> }) | null;
    const countryCode = formData.get("countryCode") as string | null;
    // Nombre del usuario que sube el archivo (viene del frontend via MSAL)
    const uploaderRaw = (formData.get("uploader") as string | null) || "";
    // Extraer solo el nombre antes del @ y del separador de dominio
    // Ej: "Antony@lozano13al000hotmail.onmicrosoft.com" → "Antony"
    const uploader = uploaderRaw.includes("@")
      ? uploaderRaw.split("@")[0]
      : uploaderRaw || "Desconocido";

    // Validaciones
    if (!file) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: "No se proporcionó ningún archivo." }
      };
    }

    if (!countryCode) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: "Debe especificar el código del país (countryCode)." }
      };
    }

    const country = COUNTRIES.find(c => c.code === countryCode);
    if (!country) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: {
          error: `País no válido: ${countryCode}`,
          validCodes: COUNTRIES.map(c => c.code)
        }
      };
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: "Solo se permiten archivos .ZIP." }
      };
    }

    // Convertir archivo a Buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const fileId = uuidv4();
    const fileName = `${fileId}_${file.name}`;

    // Ruta por fecha local del país: {storagePath}/DD-MM-YYYY/{archivo}
    // Usamos la timezone del país para que la carpeta refleje el día local
    const { DateTime } = await import("luxon");
    const now         = DateTime.utc();
    const localDate   = now.setZone(country.timezone);
    const dateFolder  = localDate.toFormat("dd-MM-yyyy");
    const uploadedAt  = now.toISO()!;          // ISO UTC — se guarda en metadata
    const blobPath    = `${country.storagePath}/${dateFolder}/${fileName}`;
    const containerName = process.env["CONTAINER_TRANSFERENCIA"] || "transferencia-archivos";

    // Subir a Blob Storage con metadata completa:
    //   uploader   → nombre del usuario que subió
    //   uploadedat → ISO UTC del momento exacto de subida
    //   countrycode → código del país (para recuperarlo sin parsear la ruta)
    //   timezone    → timezone del país (para que el frontend convierta la hora)
    await uploadBlob(
      "STORAGE_TRANSFERENCIA_CONNECTION",
      containerName,
      blobPath,
      fileBuffer,
      {
        uploader:    uploader,
        uploadedat:  uploadedAt,
        countrycode: countryCode,
        timezone:    country.timezone,
      }
    );

    context.log(`Archivo subido: ${blobPath}`);

    // ── SIMULACIÓN DE AZURE DEFENDER ──────────────────────────────────────
    // DEFENDER_MOCK=true → simula el escaneo escribiendo tags en el blob.
    // En producción (con Defender real activo) esto no se ejecuta.
    //
    // Flujo simulado:
    //   1. El blob queda SIN tag → frontend muestra "Unscanned" (Sin escanear)
    //   2. Espera DEFENDER_MOCK_DELAY segundos (default: 10)
    //   3. Escribe el tag final:
    //      - "Malicious"       si el nombre contiene: PruebaAntony, ReporteGonzalo, Ventas123
    //      - "No threats found" para cualquier otro archivo
    if (process.env["DEFENDER_MOCK"] === "true") {
      const delaySeconds = parseInt(process.env["DEFENDER_MOCK_DELAY"] || "10");

      // Nombres que simulan ser maliciosos (case-insensitive)
      const MALICIOUS_NAMES = ["PruebaAntony", "ReporteGonzalo", "Ventas123"];

      const { BlobServiceClient } = await import("@azure/storage-blob");
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env["STORAGE_TRANSFERENCIA_CONNECTION"]!
      );
      const blobClient = blobServiceClient
        .getContainerClient(containerName)
        .getBlobClient(blobPath);

      // Paso 1: el blob queda sin tag → se muestra como "Unscanned" en el frontend
      // No escribimos nada — ese es el comportamiento por defecto de Defender

      context.log(`[MOCK] Blob subido sin tag (Unscanned): ${blobPath}`);

      // Paso 2: después del delay escribir el resultado final y mover el blob
      setImmediate(async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));

          const nameToCheck = file.name.toLowerCase().replace(/\.zip$/i, "");
          const isMalicious = MALICIOUS_NAMES.some(n =>
            nameToCheck.includes(n.toLowerCase())
          );

          const finalResult = isMalicious ? "Malicious" : "No threats found";

          // Escribir tag de resultado
          await blobClient.setTags({ "Malware Scanning Result": finalResult });
          context.log(`[MOCK] Tag '${finalResult}' escrito en: ${blobPath}`);

          // ── Mover blob a la carpeta correspondiente ────────────────────
          // "No threats found" → MENSUALES/{storagePath}/ (archivos limpios)
          // "Malicious"        → MENSUALES/{storagePath}/ERROR/ (amenazas)
          const { BlobServiceClient: BSC } = await import("@azure/storage-blob");
          const svc       = BSC.fromConnectionString(process.env["STORAGE_TRANSFERENCIA_CONNECTION"]!);
          const container = svc.getContainerClient(containerName);

          // Descargar el blob original
          const downloadResponse = await container.getBlobClient(blobPath).download(0);
          const chunks: Buffer[] = [];
          for await (const chunk of downloadResponse.readableStreamBody as AsyncIterable<Buffer>) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const fileData = Buffer.concat(chunks);

          // Determinar ruta destino
          const destPath = isMalicious
            ? `MENSUALES/${country.storagePath}/ERROR/${fileName}`
            : `MENSUALES/${country.storagePath}/${fileName}`;

          // Subir a destino con el mismo metadata + tag de resultado
          const destBlob = container.getBlockBlobClient(destPath);
          await destBlob.upload(fileData, fileData.length, {
            metadata: {
              uploader:    uploader,
              uploadedat:  uploadedAt,
              countrycode: countryCode,
              timezone:    country.timezone,
            }
          });
          await destBlob.setTags({ "Malware Scanning Result": finalResult });

          context.log(`[MOCK] Blob movido a: ${destPath}`);

        } catch (e: any) {
          context.error(`[MOCK] Error en post-escaneo: ${e.message}`);
        }
      });
    }
    // ── FIN SIMULACIÓN ────────────────────────────────────────────────────

    // Encolar para escaneo
    const queueMessage = {
      fileId,
      fileName,
      blobPath,
      countryCode,
      storagePath: country.storagePath,
      uploadedAt,          // mismo ISO UTC que se guardó en metadata
      fileSize: fileBuffer.length,
      originalName: file.name
    };

    await sendQueueMessage(
      process.env["QUEUE_SCAN"] || "queue-zip-scan",
      queueMessage
    );

    context.log(`Mensaje encolado en queue-zip-scan para: ${fileName}`);

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        success: true,
        fileId,
        fileName,
        blobPath,
        countryCode,
        message: "Archivo subido exitosamente. El escaneo comenzará en breve."
      }
    };

  } catch (error: any) {
    context.error(`Error en UploadZip: ${error.message}`);
    return {
      status: 500,
      headers: corsHeaders,
      jsonBody: { error: `Error interno: ${error.message}` }
    };
  }
}

app.http("UploadZip", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "upload",
  handler: uploadZip
});
