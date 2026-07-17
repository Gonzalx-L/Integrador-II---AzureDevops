import { app, InvocationContext } from "@azure/functions";
import { downloadBlob, uploadBlob } from "../../utils/blobHelper";
import { decodeQueueMessage } from "../../utils/queueHelper";

interface CleanZipMessage {
  fileName: string;
  blobPath: string;
  countryCode: string;
  storagePath: string;
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

    // Extraer la carpeta de fecha de la ruta original
    // blobPath formato: {storagePath}/{DD-MM-YYYY}/{uuid}_archivo.zip
    const pathParts   = message.blobPath.split("/");
    const storagePath = pathParts[0];   // ej: BLUETAB_PERU
    const dateFolder  = pathParts[1];   // ej: 13-07-2026

    // 1. Mover a DESBLOQUEADOS dentro de la misma carpeta de fecha
    //    {storagePath}/{DD-MM-YYYY}/DESBLOQUEADOS/{fileName}
    const desbloqueadosPath = `${storagePath}/${dateFolder}/DESBLOQUEADOS/${message.fileName}`;
    await uploadBlob(
      "STORAGE_TRANSFERENCIA_CONNECTION",
      containerTransferencia,
      desbloqueadosPath,
      zipBuffer
    );
    context.log(`Archivo copiado a DESBLOQUEADOS: ${desbloqueadosPath}`);

    // 2. Replicar en el storage de documentos final (misma estructura)
    //    {storagePath}/{DD-MM-YYYY}/{fileName}
    const documentosPath = `${storagePath}/${dateFolder}/${message.fileName}`;
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
