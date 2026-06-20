import { app, InvocationContext } from "@azure/functions";
import { downloadBlob, uploadBlob } from "../../utils/blobHelper";
import { decodeQueueMessage } from "../../utils/queueHelper";

interface CleanZipMessage {
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
 * OnCleanZipFromQueue — Queue Trigger
 * Procesa archivos ZIP limpios (sin amenazas, sin contraseña).
 * 1. Mueve el archivo a MENSUALES/{PAIS}/DESBLOQUEADOS/ en sttransferenciaarchivosdev
 * 2. Replica el archivo en stdocumentocolaboradordev bajo documentos/{PAIS}/MENSUALES/
 */
export async function onCleanZipFromQueue(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  const message = decodeQueueMessage<CleanZipMessage>(queueItem as string);
  context.log(`OnCleanZipFromQueue procesando archivo limpio: ${message.fileName}`);

  const containerTransferencia = process.env["CONTAINER_TRANSFERENCIA"] || "transferencia-archivos";
  const containerDocumentos = process.env["CONTAINER_DOCUMENTOS"] || "documentos";

  try {
    // Descargar el ZIP desde el storage de transferencia
    const zipBuffer = await downloadBlob(
      "STORAGE_TRANSFERENCIA_CONNECTION",
      containerTransferencia,
      message.blobPath
    );

    // 1. Mover a DESBLOQUEADOS en el storage de transferencia
    const desbloqueadosPath = `MENSUALES/${message.countryCode}/DESBLOQUEADOS/${message.fileName}`;
    await uploadBlob(
      "STORAGE_TRANSFERENCIA_CONNECTION",
      containerTransferencia,
      desbloqueadosPath,
      zipBuffer
    );
    context.log(`Archivo copiado a DESBLOQUEADOS: ${desbloqueadosPath}`);

    // 2. Replicar en el storage de documentos final
    const documentosPath = `${message.countryCode}/MENSUALES/${message.fileName}`;
    await uploadBlob(
      "STORAGE_DOCUMENTOS_CONNECTION",
      containerDocumentos,
      documentosPath,
      zipBuffer
    );
    context.log(`Archivo replicado en documentos finales: ${documentosPath}`);

    context.log(`✅ Archivo ${message.fileName} procesado exitosamente como LIMPIO.`);

  } catch (error: any) {
    context.error(`Error procesando archivo limpio ${message.fileName}: ${error.message}`);
    throw error; // Reintento automático por Azure Functions
  }
}

app.storageQueue("OnCleanZipFromQueue", {
  queueName: process.env["QUEUE_LIMPIOS"] || "queue-zip-limpios",
  connection: "STORAGE_TRANSFERENCIA_CONNECTION",
  handler: onCleanZipFromQueue
});
