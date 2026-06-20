import { app, InvocationContext } from "@azure/functions";
import { downloadBlob, uploadBlob } from "../../utils/blobHelper";
import { decodeQueueMessage, sendQueueMessage } from "../../utils/queueHelper";
import { getZipPassword } from "../../utils/keyVaultHelper";
import { unlockAndRepackZip } from "../../utils/zipHelper";
import { scanZipBuffer } from "../../utils/defenderMock";

interface ProtectedZipMessage {
  fileName: string;
  blobPath: string;
  countryCode: string;
  uploadedAt: string;
  fileSize: number;
  scanResult: string;
  scanDetails: string;
  scannedAt: string;
  isPasswordProtected: boolean;
}

/**
 * OnProtecedZipFromQueue — Queue Trigger
 * Procesa archivos ZIP protegidos con contraseña.
 * 1. Obtiene la contraseña desde Key Vault
 * 2. Desbloquea y descomprime el ZIP
 * 3. Re-escanea el contenido descomprimido con Defender
 * 4. Si está limpio → guarda en documentos/{PAIS}/MENSUALES/
 * 5. Si tiene amenaza → encola en queue-zip-error
 */
export async function onProtecedZipFromQueue(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  const message = decodeQueueMessage<ProtectedZipMessage>(queueItem as string);
  context.log(`OnProtecedZipFromQueue procesando ZIP protegido: ${message.fileName}`);

  const containerTransferencia = process.env["CONTAINER_TRANSFERENCIA"] || "transferencia-archivos";
  const containerDocumentos = process.env["CONTAINER_DOCUMENTOS"] || "documentos";

  try {
    // 1. Descargar el ZIP protegido
    const encryptedBuffer = await downloadBlob(
      "STORAGE_TRANSFERENCIA_CONNECTION",
      containerTransferencia,
      message.blobPath
    );
    context.log(`ZIP protegido descargado: ${message.fileName} (${encryptedBuffer.length} bytes)`);

    // 2. Obtener contraseña desde Key Vault
    context.log(`Consultando Key Vault para contraseña de ${message.countryCode}...`);
    const password = await getZipPassword(message.countryCode);
    context.log(`Contraseña obtenida del Key Vault para ${message.countryCode}`);

    // 3. Desbloquear y reempaquetar el ZIP sin contraseña
    const cleanBuffer = unlockAndRepackZip(encryptedBuffer, password);
    context.log(`ZIP desbloqueado exitosamente: ${message.fileName}`);

    // 4. Re-escanear el ZIP limpio para verificar que no hay amenazas
    const reScanReport = await scanZipBuffer(
      cleanBuffer,
      message.fileName,
      message.blobPath,
      message.countryCode
    );

    if (reScanReport.result === "ERROR") {
      context.warn(`Amenaza detectada después de desbloquear ${message.fileName}: ${reScanReport.details}`);

      await sendQueueMessage(process.env["QUEUE_ERROR"] || "queue-zip-error", {
        ...message,
        scanResult: "ERROR",
        scanDetails: `Amenaza detectada tras desbloqueo: ${reScanReport.details}`,
        scannedAt: new Date().toISOString()
      });
      return;
    }

    // 5. Guardar el ZIP limpio en el storage de documentos
    const documentosPath = `${message.countryCode}/MENSUALES/${message.fileName}`;
    await uploadBlob(
      "STORAGE_DOCUMENTOS_CONNECTION",
      containerDocumentos,
      documentosPath,
      cleanBuffer
    );

    context.log(`✅ ZIP protegido procesado exitosamente: ${documentosPath}`);

  } catch (error: any) {
    context.error(`Error procesando ZIP protegido ${message.fileName}: ${error.message}`);

    // Si no se puede desbloquear → mandar a error
    await sendQueueMessage(process.env["QUEUE_ERROR"] || "queue-zip-error", {
      ...message,
      scanResult: "ERROR",
      scanDetails: `No se pudo desbloquear el ZIP: ${error.message}`,
      scannedAt: new Date().toISOString()
    });
  }
}

app.storageQueue("OnProtecedZipFromQueue", {
  queueName: process.env["QUEUE_PROTEGIDOS"] || "queue-zip-protegidos",
  connection: "STORAGE_TRANSFERENCIA_CONNECTION",
  handler: onProtecedZipFromQueue
});
