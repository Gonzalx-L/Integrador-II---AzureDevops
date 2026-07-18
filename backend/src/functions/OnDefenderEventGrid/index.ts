import { app, InvocationContext } from "@azure/functions";
import { sendQueueMessage } from "../../utils/queueHelper";

/**
 * Estructura del evento que Azure Defender for Storage publica en Event Grid
 * cuando termina el escaneo de malware de un blob.
 *
 * Referencia:
 * https://learn.microsoft.com/azure/defender-for-cloud/defender-for-storage-introduction
 *
 * Evento tipo: Microsoft.Security.MalwareScanningResult
 */
interface DefenderEventGridEvent {
  id:          string;
  eventType:   string;   // "Microsoft.Security.MalwareScanningResult"
  subject:     string;   // ruta del blob
  eventTime:   string;
  data: {
    // Resultado del escaneo — valores posibles:
    //   "No threats found"  → archivo limpio
    //   "Malicious"         → amenaza confirmada
    //   "Suspicious"        → comportamiento sospechoso
    scanResultType:    string;
    blobUri:           string;   // URL completa del blob
    storageAccountName:string;
    containerName:     string;
    blobName:          string;   // ruta relativa: {storagePath}/{fecha}/{uuid}_archivo.zip
    correlationId:     string;
    scanFinishedTimeUtc: string;
    // Solo presente si scanResultType === "Malicious"
    threats?: Array<{
      threatName: string;
      severity:   string;   // "High" | "Medium" | "Low"
      category:   string;   // "Trojan" | "Ransomware" | etc.
    }>;
  };
}

/**
 * OnDefenderEventGrid — Event Grid Trigger
 *
 * Recibe el resultado del escaneo de Azure Defender for Storage vía Event Grid.
 * Según el resultado encola el mensaje en la cola correspondiente:
 *   - "No threats found" → queue-zip-limpios
 *   - "Malicious"        → queue-zip-error
 *   - "Suspicious"       → queue-zip-error (tratado igual que malicioso)
 *
 * Para activar en producción:
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

  try {
    // Event Grid entrega un array con un objeto por evento
    const payload = Array.isArray(event) ? event[0] : event;
    const ev = payload as DefenderEventGridEvent;

    context.log(`Defender scan result: ${ev.data?.scanResultType} — blob: ${ev.data?.blobName}`);

    const blobName     = ev.data?.blobName     || "";
    const blobUri      = ev.data?.blobUri       || "";
    const scanResult   = ev.data?.scanResultType || "Unknown";
    const scannedAt    = ev.data?.scanFinishedTimeUtc || new Date().toISOString();
    const threats      = ev.data?.threats || [];

    // Extraer el nombre limpio del archivo (sin UUID)
    const rawFileName  = blobName.split("/").pop() ?? blobName;
    const cleanFileName = rawFileName.replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
      ""
    );

    // Extraer countryCode de la ruta del blob
    // Formato esperado: BLUETAB_PERU/DD-MM-YYYY/uuid_archivo.zip
    const pathParts  = blobName.split("/");
    const countryCode = pathParts[0]?.replace("BLUETAB_", "") || "UNKNOWN";

    const queuePayload = {
      fileName:    cleanFileName,
      blobPath:    blobName,
      blobUri,
      countryCode,
      uploadedAt:  ev.eventTime || new Date().toISOString(),
      scanResult,
      scanDetails: threats.length > 0
        ? threats.map(t => `${t.threatName} (${t.category} - ${t.severity})`).join(", ")
        : scanResult === "No threats found"
          ? "Escaneo completado sin amenazas."
          : `Resultado: ${scanResult}`,
      scannedAt,
      isPasswordProtected: false
    };

    if (scanResult === "No threats found") {
      // Archivo limpio → procesar normalmente
      await sendQueueMessage(
        process.env["QUEUE_LIMPIOS"] || "queue-zip-limpios",
        queuePayload
      );
      context.log(`✅ Archivo limpio encolado en queue-zip-limpios: ${cleanFileName}`);

    } else if (scanResult === "Malicious" || scanResult === "Suspicious") {
      // Amenaza detectada → enviar a error
      await sendQueueMessage(
        process.env["QUEUE_ERROR"] || "queue-zip-error",
        queuePayload
      );
      context.warn(`⚠️ Amenaza detectada (${scanResult}), encolado en queue-zip-error: ${cleanFileName}`);

    } else {
      // Resultado desconocido o "Scanning" — solo loguear
      context.log(`Resultado no manejado: ${scanResult} para ${cleanFileName}`);
    }

  } catch (error: any) {
    context.error(`Error procesando evento de Defender: ${error.message}`);
    // No relanzamos — si falla el evento de EG no tiene reintento automático útil
  }
}

app.eventGrid("OnDefenderEventGrid", {
  handler: onDefenderEventGrid
});