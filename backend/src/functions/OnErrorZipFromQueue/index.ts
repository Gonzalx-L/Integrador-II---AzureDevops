import { app, InvocationContext } from "@azure/functions";
import { downloadBlob, uploadBlob } from "../../utils/blobHelper";
import { decodeQueueMessage } from "../../utils/queueHelper";

interface ErrorZipMessage {
  fileName: string;
  blobPath: string;
  countryCode: string;
  uploadedAt: string;
  fileSize: number;
  scanResult: string;
  scanDetails: string;
  scannedAt: string;
}

/**
 * OnErrorZipFromQueue — Queue Trigger
 * Procesa archivos ZIP con errores (corruptos, con amenazas, inválidos).
 * Mueve el archivo a la carpeta ERROR para revisión manual.
 * Registra el motivo del error en los logs.
 */
export async function onErrorZipFromQueue(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  const message = decodeQueueMessage<ErrorZipMessage>(queueItem as string);
  context.log(`OnErrorZipFromQueue procesando archivo con error: ${message.fileName}`);
  context.log(`Motivo del error: ${message.scanDetails}`);

  const containerTransferencia = process.env["CONTAINER_TRANSFERENCIA"] || "transferencia-archivos";

  try {
    // Descargar el ZIP con error
    const zipBuffer = await downloadBlob(
      "STORAGE_TRANSFERENCIA_CONNECTION",
      containerTransferencia,
      message.blobPath
    );

    // Mover a la carpeta ERROR con metadata del error en el nombre
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const errorPath = `MENSUALES/${message.countryCode}/ERROR/${timestamp}_${message.fileName}`;

    await uploadBlob(
      "STORAGE_TRANSFERENCIA_CONNECTION",
      containerTransferencia,
      errorPath,
      zipBuffer
    );

    // Guardar un archivo de log con el detalle del error
    const errorLog = JSON.stringify({
      originalFile: message.fileName,
      originalPath: message.blobPath,
      countryCode: message.countryCode,
      uploadedAt: message.uploadedAt,
      errorReason: message.scanDetails,
      errorAt: message.scannedAt,
      movedTo: errorPath
    }, null, 2);

    await uploadBlob(
      "STORAGE_TRANSFERENCIA_CONNECTION",
      containerTransferencia,
      `${errorPath}.error.json`,
      Buffer.from(errorLog, "utf-8")
    );

    context.log(`⚠️ Archivo con error movido a: ${errorPath}`);
    context.log(`Log de error guardado en: ${errorPath}.error.json`);

  } catch (error: any) {
    context.error(`Error al mover archivo a carpeta ERROR: ${error.message}`);
    // No relanzamos el error para evitar reintentos infinitos en archivos corruptos
  }
}

app.storageQueue("OnErrorZipFromQueue", {
  queueName: process.env["QUEUE_ERROR"] || "queue-zip-error",
  connection: "STORAGE_TRANSFERENCIA_CONNECTION",
  handler: onErrorZipFromQueue
});
