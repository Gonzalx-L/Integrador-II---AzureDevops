import * as df from "durable-functions";
import { ActivityHandler } from "durable-functions";
import { uploadBlob } from "../../utils/blobHelper";
import { sendQueueMessage } from "../../utils/queueHelper";
import { v4 as uuidv4 } from "uuid";

/**
 * DurableExecutions — Durable Activity
 * Recibe los archivos ZIP pendientes para un país y los sube al Blob Storage
 * en la ruta MENSUALES/{PAIS}/. Luego encola un mensaje para que Event Grid
 * dispare el escaneo de Defender.
 *
 * En un flujo real, aquí se obtendría la lista de archivos pendientes
 * desde una base de datos o desde el contenedor uploads-raw.
 * Para el pipeline actual, simula la recepción de un archivo de prueba.
 */
const activityHandler: ActivityHandler = async (
  input: { countryCode: string; storagePath: string; triggeredAt: string },
  context
): Promise<{ processedFiles: number; files: string[] }> => {
  context.log(`DurableExecutions procesando país: ${input.countryCode}`);

  const containerName = process.env["CONTAINER_TRANSFERENCIA"] || "transferencia-archivos";
  const connectionEnvVar = "STORAGE_TRANSFERENCIA_CONNECTION";
  const processedFileNames: string[] = [];

  // -----------------------------------------------------------------
  // NOTA: En producción, aquí se listarían los blobs en uploads-raw
  // para el país correspondiente y se moverían a MENSUALES/{PAIS}/.
  // Para desarrollo/demo, se registra la operación sin mover archivos
  // reales (los archivos llegan por el frontend de carga).
  // -----------------------------------------------------------------

  context.log(`Archivos del país ${input.countryCode} listos para escaneo en ${containerName}/MENSUALES/${input.storagePath}/`);

  return {
    processedFiles: processedFileNames.length,
    files: processedFileNames
  };
};

df.app.activity("DurableExecutions", { handler: activityHandler });
