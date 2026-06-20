import { app, InvocationContext } from "@azure/functions";
import { sendQueueMessage } from "../../utils/queueHelper";
import { downloadBlob } from "../../utils/blobHelper";
import { scanZipBuffer, ScanReport } from "../../utils/defenderMock";
import { decodeQueueMessage } from "../../utils/queueHelper";

interface ScanQueueMessage {
  fileName: string;
  blobPath: string;
  countryCode: string;
  uploadedAt: string;
  fileSize: number;
}

/**
 * OnDefenderScanResultQueue — Queue Trigger
 * Lee mensajes de queue-zip-scan.
 * Descarga el ZIP desde Blob Storage, lo escanea (mock o Defender real)
 * y encola el resultado en la cola correspondiente:
 *   - CLEAN     → queue-zip-limpios
 *   - PROTECTED → queue-zip-protegidos
 *   - ERROR     → queue-zip-error
 */
export async function onDefenderScanResultQueue(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  const message = decodeQueueMessage<ScanQueueMessage>(queueItem as string);
  context.log(`OnDefenderScanResultQueue procesando: ${message.fileName}`);

  const containerName = process.env["CONTAINER_TRANSFERENCIA"] || "transferencia-archivos";

  try {
    // Descargar el ZIP desde Blob Storage
    const zipBuffer = await downloadBlob(
      "STORAGE_TRANSFERENCIA_CONNECTION",
      containerName,
      message.blobPath
    );

    // Escanear el archivo
    const scanReport: ScanReport = await scanZipBuffer(
      zipBuffer,
      message.fileName,
      message.blobPath,
      message.countryCode
    );

    context.log(`Resultado del escaneo: ${scanReport.result} — ${scanReport.details}`);

    // Enrutar a la cola correspondiente según el resultado
    const queuePayload = {
      ...message,
      scanResult: scanReport.result,
      scanDetails: scanReport.details,
      scannedAt: scanReport.scannedAt,
      isPasswordProtected: scanReport.isPasswordProtected
    };

    switch (scanReport.result) {
      case "CLEAN":
        await sendQueueMessage(process.env["QUEUE_LIMPIOS"] || "queue-zip-limpios", queuePayload);
        context.log(`Archivo ${message.fileName} encolado en queue-zip-limpios`);
        break;

      case "PROTECTED":
        await sendQueueMessage(process.env["QUEUE_PROTEGIDOS"] || "queue-zip-protegidos", queuePayload);
        context.log(`Archivo ${message.fileName} encolado en queue-zip-protegidos`);
        break;

      case "ERROR":
      default:
        await sendQueueMessage(process.env["QUEUE_ERROR"] || "queue-zip-error", queuePayload);
        context.log(`Archivo ${message.fileName} encolado en queue-zip-error`);
        break;
    }

  } catch (error: any) {
    context.error(`Error procesando ${message.fileName}: ${error.message}`);

    // Si falla el escaneo, mandarlo a la cola de error
    await sendQueueMessage(process.env["QUEUE_ERROR"] || "queue-zip-error", {
      ...message,
      scanResult: "ERROR",
      scanDetails: `Fallo en el escaneo: ${error.message}`,
      scannedAt: new Date().toISOString(),
      isPasswordProtected: false
    });
  }
}

app.storageQueue("OnDefenderScanResultQueue", {
  queueName: process.env["QUEUE_SCAN"] || "queue-zip-scan",
  connection: "STORAGE_TRANSFERENCIA_CONNECTION",
  handler: onDefenderScanResultQueue
});
