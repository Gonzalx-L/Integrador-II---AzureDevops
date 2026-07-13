import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";

/**
 * Obtiene un cliente de Blob Storage usando la connection string del entorno.
 */
export function getBlobServiceClient(connectionStringEnvVar: string): BlobServiceClient {
  const connectionString = process.env[connectionStringEnvVar];
  if (!connectionString) {
    throw new Error(`Variable de entorno no encontrada: ${connectionStringEnvVar}`);
  }
  return BlobServiceClient.fromConnectionString(connectionString);
}

/**
 * Sube un buffer como blob a un contenedor con metadata opcional.
 */
export async function uploadBlob(
  connectionStringEnvVar: string,
  containerName: string,
  blobPath: string,
  content: Buffer,
  metadata?: Record<string, string>
): Promise<string> {
  const client = getBlobServiceClient(connectionStringEnvVar);
  const containerClient = client.getContainerClient(containerName);
  await containerClient.createIfNotExists();

  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
  await blockBlobClient.upload(content, content.length, {
    metadata: metadata || {}
  });

  return blockBlobClient.url;
}

/**
 * Descarga un blob como Buffer.
 */
export async function downloadBlob(
  connectionStringEnvVar: string,
  containerName: string,
  blobPath: string
): Promise<Buffer> {
  const client = getBlobServiceClient(connectionStringEnvVar);
  const containerClient = client.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

  const downloadResponse = await blockBlobClient.download(0);
  const chunks: Buffer[] = [];

  for await (const chunk of downloadResponse.readableStreamBody as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/**
 * Mueve un blob de una ruta a otra dentro del mismo contenedor.
 */
export async function moveBlob(
  connectionStringEnvVar: string,
  containerName: string,
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  const content = await downloadBlob(connectionStringEnvVar, containerName, sourcePath);
  await uploadBlob(connectionStringEnvVar, containerName, destinationPath, content);

  // Eliminar el blob original
  const client = getBlobServiceClient(connectionStringEnvVar);
  const containerClient = client.getContainerClient(containerName);
  await containerClient.getBlockBlobClient(sourcePath).delete();
}

/**
 * Elimina un blob.
 */
export async function deleteBlob(
  connectionStringEnvVar: string,
  containerName: string,
  blobPath: string
): Promise<void> {
  const client = getBlobServiceClient(connectionStringEnvVar);
  const containerClient = client.getContainerClient(containerName);
  await containerClient.getBlockBlobClient(blobPath).deleteIfExists();
}
