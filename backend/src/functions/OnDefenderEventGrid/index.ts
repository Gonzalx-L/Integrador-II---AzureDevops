import { app, InvocationContext } from "@azure/functions";
import { sendQueueMessage } from "../../utils/queueHelper";

/**
 * OnDefenderEventGrid — Event Grid Trigger
 *
 * Recibe el resultado real de Azure Defender for Storage (Malware Scanning).
 * Defender publica un evento "Microsoft.Security.MalwareScanningResult"
 * en el Event Grid Topic cada vez que termina de escanear un blob.
 *
 * El evento llega con este shape:
 * {
 *   eventType: "Microsoft.Security.MalwareScanningResult",
 *   data: {
 *     verdict:              "No threats found" | "Malicious" | "Suspicious",
 *     blobUri:              "https://sttransferenciaarchivos.blob.core.windows.net/...",
 *     scanFinishedTimeUtc:  "2026-07-16T10:00:00Z",
 *     threatName:           "" | "Trojan:Win32/..."
 *   }
 * }
 *
 * Este handler:
 *   1. Extrae blobUri y verdict del evento
 *   2. Reconstruye el mensaje con la misma forma que usaba el mock
 *   3. Encola en la cola correspondiente:
 *      - "No threats found" → queue-zip-limpios
 *      - "Malicious"        → queue-zip-error
 *      - "Suspicious"       → queue-zip-error  (tratamos como error por seguridad)
 *   4. El resto del pipeline (OnCleanZipFromQueue, OnErrorZipFromQueue) sigue igual
 */
export async function onDefenderEventGrid(
  event: unknown,
  context: InvocationContext
): Promise<void> {
  context.log("OnDefenderEventGrid — evento recibido de Azure Defender");
  context.log(JSON.stringify(event));

  const ev = event as any;

  // El evento puede llegar como array (Event Grid batch) o como objeto único
  const data = Array.isArray(ev) ? ev[0]?.data : ev?.data;

  if (!data) {
    context.warn("Evento sin data — ignorado");
    return;
  }

  const verdict:   string = data.verdict             || "Malicious";
  const blobUri:   string = data.blobUri             || "";
  const scannedAt: string = data.scanFinishedTimeUtc || new Date().toISOString();
  const threatName:string = data.threatName          || "";

  context.log(`Verdict: ${verdict} | Blob: ${blobUri}`);

  if (!blobUri) {
    context.warn("blobUri vacío — no se puede procesar");
    return;
  }

  // Extraer countryCode y fileName desde la URL del blob
  // Formato esperado: https://{account}.blob.core.windows.net/{container}/{storagePath}/{dateFolder}/{uuid}_{nombre}.zip
  // Ejemplo: https://sttransferenciaarchivos.blob.core.windows.net/transferencia-archivos/BLUETAB_PERU/16-07-2026/abc_doc.zip
  const urlParts  = blobUri.replace("https://", "").split("/");
  // urlParts[0] = account.blob.core.windows.net
  // urlParts[1] = container
  // urlParts[2] = storagePath (BLUETAB_PERU, BLUETAB_ESPANA, etc.)
  // urlParts[3] = dateFolder (DD-MM-YYYY)
  // urlParts[4] = fileName
  const container   = urlParts[1] || "";
  const storagePath = urlParts[2] || "";
  const dateFolder  = urlParts[3] || "";
  const fileName    = urlParts.slice(4).join("/"); // por si el nombre tiene /
  const blobPath    = `${storagePath}/${dateFolder}/${fileName}`;

  // Inferir countryCode desde storagePath: BLUETAB_PERU → PERU
  const countryCode = storagePath.replace("BLUETAB_", "");

  const queuePayload = {
    fileName,
    blobPath,
    countryCode,
    storagePath,
    uploadedAt:          new Date().toISOString(), // no tenemos el original, aproximamos
    fileSize:            0,                        // no disponible en el evento
    scanResult:          verdict,
    scanDetails:         threatName
                          ? `Amenaza detectada por Azure Defender: ${threatName}`
                          : `Azure Defender: ${verdict}`,
    scannedAt,
    isPasswordProtected: false,
    source:              "AzureDefenderReal"       // para distinguir del mock en logs
  };

  switch (verdict) {
    case "No threats found":
      await sendQueueMessage(
        process.env["QUEUE_LIMPIOS"] || "queue-zip-limpios",
        queuePayload
      );
      context.log(`✅ Archivo limpio encolado: ${fileName}`);
      break;

    case "Malicious":
    case "Suspicious":
    default:
      await sendQueueMessage(
        process.env["QUEUE_ERROR"] || "queue-zip-error",
        { ...queuePayload, scanResult: "ERROR" }
      );
      context.log(`🚫 Archivo con amenaza encolado en error: ${fileName} — ${verdict}`);
      break;
  }
}

app.eventGrid("OnDefenderEventGrid", {
  handler: onDefenderEventGrid
});
