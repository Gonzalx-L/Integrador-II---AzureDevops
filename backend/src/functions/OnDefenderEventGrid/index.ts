import { app, InvocationContext } from "@azure/functions";
import { sendQueueMessage } from "../../utils/queueHelper";

/**
 * Estructura del evento que Azure Defender for Storage publica en Event Grid.
 * Evento tipo: Microsoft.Security.MalwareScanningResult
 *
 * Referencia:
 * https://learn.microsoft.com/azure/defender-for-cloud/defender-for-storage-introduction
 */
interface DefenderEventGridEvent {
  id:        string;
  eventType: string;
  subject:   string;
  eventTime: string;
  data: {
    // Schema v1 — campo usado por ramaAntony
    scanResultType?:     string;
    blobName?:           string;
    storageAccountName?: string;
    containerName?:      string;
    correlationId?:      string;
    threats?: Array<{
      threatName: string;
      severity:   string;
      category:   string;
    }>;
    // Schema v2 — campo usado por main
    verdict?:    string;
    threatName?: string;
    // Común en ambos schemas
    blobUri:             string;
    scanFinishedTimeUtc: string;
  };
}

/**
 * OnDefenderEventGrid — Event Grid Trigger
 *
 * Recibe el resultado del escaneo de Azure Defender for Storage vía Event Grid
 * y encola el mensaje en la cola correspondiente:
 *   - "No threats found" → queue-zip-limpios   → OnCleanZipFromQueue
 *   - "Malicious"        → queue-zip-error      → OnErrorZipFromQueue
 *   - "Suspicious"       → queue-zip-error      → OnErrorZipFromQueue
 *
 * Compatible con ambos schemas de evento (v1 con scanResultType/blobName
 * y v2 con verdict/blobUri).
 *
 * Para activar:
 *   Portal Azure → Event Grid Topic (evgt-transferenciaarch-dev)
 *   → Event Subscriptions → sub-defender-malware-result
 *   → Filter: Microsoft.Security.MalwareScanningResult
 *   → Endpoint: esta función
 *
 * Para desactivar después de la demo:
 *   Portal Azure → sttransferenciaarchivos → Microsoft Defender for Cloud → Off
 */
export async function onDefenderEventGrid(
  event: unknown,
  context: InvocationContext
): Promise<void> {
  context.log("OnDefenderEventGrid: evento recibido de Azure Defender");
  context.log(JSON.stringify(event));

  try {
    // Event Grid puede entregar array (batch) o objeto único
    const payload = Array.isArray(event) ? event[0] : event;
    const ev      = payload as DefenderEventGridEvent;
    const data    = ev?.data;

    if (!data) {
      context.warn("Evento sin data — ignorado");
      return;
    }

    // Resolver scanResult: schema v1 usa scanResultType, v2 usa verdict
    const scanResult = data.scanResultType || data.verdict || "Unknown";

    // Resolver blobUri y blobName
    const blobUri  = data.blobUri || "";
    let   blobName = data.blobName || "";

    // Si no viene blobName, reconstruirlo desde la URL
    // https://{account}.blob.core.windows.net/{container}/{storagePath}/{dateFolder}/{uuid}_{nombre}.zip
    if (!blobName && blobUri) {
      const urlParts = blobUri.replace("https://", "").split("/");
      // [0]=account, [1]=container, [2+]=blobPath
      blobName = urlParts.slice(2).join("/");
    }

    context.log(`Defender result: ${scanResult} — blob: ${blobName}`);

    // Construir detalles del escaneo
    const threats     = data.threats || [];
    const threatName  = data.threatName || "";
    const scannedAt   = data.scanFinishedTimeUtc || new Date().toISOString();

    const scanDetails = threats.length > 0
      ? threats.map(t => `${t.threatName} (${t.category} - ${t.severity})`).join(", ")
      : threatName
        ? `Amenaza detectada por Azure Defender: ${threatName}`
        : scanResult === "No threats found"
          ? "Escaneo completado sin amenazas."
          : `Resultado: ${scanResult}`;

    // Extraer nombre limpio del archivo (sin UUID)
    const rawFileName   = blobName.split("/").pop() ?? blobName;
    const cleanFileName = rawFileName.replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
      ""
    );

    // Inferir countryCode desde la ruta: BLUETAB_PERU/... → PERU
    const pathParts   = blobName.split("/");
    const countryCode = (pathParts[0] || "").replace("BLUETAB_", "") || "UNKNOWN";
    const storagePath = pathParts[0] || "";
    const dateFolder  = pathParts[1] || "";

    const queuePayload = {
      fileName:            cleanFileName,
      blobPath:            blobName,
      blobUri,
      countryCode,
      storagePath,
      dateFolder,
      uploadedAt:          ev.eventTime || new Date().toISOString(),
      fileSize:            0,
      scanResult,
      scanDetails,
      scannedAt,
      isPasswordProtected: false,
    };

    if (scanResult === "No threats found") {
      await sendQueueMessage(
        process.env["QUEUE_LIMPIOS"] || "queue-zip-limpios",
        queuePayload
      );
      context.log(`✅ Archivo limpio encolado en queue-zip-limpios: ${cleanFileName}`);

    } else if (scanResult === "Malicious" || scanResult === "Suspicious") {
      await sendQueueMessage(
        process.env["QUEUE_ERROR"] || "queue-zip-error",
        queuePayload
      );
      context.warn(`⚠️ ${scanResult} encolado en queue-zip-error: ${cleanFileName}`);

    } else {
      // "Scanning", "Unknown" u otros — solo loguear
      context.log(`Resultado no manejado: ${scanResult} para ${cleanFileName}`);
    }

  } catch (error: any) {
    context.error(`Error procesando evento de Defender: ${error.message}`);
    // No relanzamos — Event Grid no tiene reintento útil para errores de lógica
  }
}

app.eventGrid("OnDefenderEventGrid", {
  handler: onDefenderEventGrid
});
