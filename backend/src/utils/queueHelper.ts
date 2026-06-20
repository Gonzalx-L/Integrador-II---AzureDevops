import { QueueClient } from "@azure/storage-queue";

/**
 * Obtiene un cliente de Queue Storage.
 */
export function getQueueClient(queueName: string): QueueClient {
  const connectionString = process.env["STORAGE_TRANSFERENCIA_CONNECTION"];
  if (!connectionString) {
    throw new Error("Variable STORAGE_TRANSFERENCIA_CONNECTION no encontrada");
  }
  return new QueueClient(connectionString, queueName);
}

/**
 * Envía un mensaje a una cola. El mensaje se serializa a JSON y se codifica en base64.
 */
export async function sendQueueMessage(queueName: string, message: object): Promise<void> {
  const client = getQueueClient(queueName);
  await client.createIfNotExists();

  const messageStr = JSON.stringify(message);
  const encoded = Buffer.from(messageStr).toString("base64");
  await client.sendMessage(encoded);
}

/**
 * Decodifica un mensaje de la cola (desde base64 a objeto).
 */
export function decodeQueueMessage<T>(messageText: string): T {
  try {
    const decoded = Buffer.from(messageText, "base64").toString("utf-8");
    return JSON.parse(decoded) as T;
  } catch {
    // Si no es base64, intentar parsear directamente
    return JSON.parse(messageText) as T;
  }
}
