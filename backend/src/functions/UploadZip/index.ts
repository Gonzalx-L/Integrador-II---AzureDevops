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
