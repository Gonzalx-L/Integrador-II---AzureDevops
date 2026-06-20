import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

let secretClient: SecretClient | null = null;

/**
 * Obtiene el cliente de Key Vault (singleton).
 * En local usa DefaultAzureCredential (az login).
 * En Azure usa Managed Identity automáticamente.
 */
function getSecretClient(): SecretClient {
  if (!secretClient) {
    const vaultUrl = process.env["KEYVAULT_URL"];
    if (!vaultUrl) {
      throw new Error("Variable KEYVAULT_URL no encontrada");
    }
    const credential = new DefaultAzureCredential();
    secretClient = new SecretClient(vaultUrl, credential);
  }
  return secretClient;
}

/**
 * Obtiene un secreto del Key Vault por nombre.
 * El nombre del secreto para cada empresa sigue el patrón:
 * zip-password-BLUETAB-PERU, zip-password-BLUETAB-ESPANA, etc.
 */
export async function getZipPassword(countryCode: string): Promise<string> {
  const secretName = `zip-password-${countryCode.replace(/_/g, "-").toUpperCase()}`;

  try {
    const client = getSecretClient();
    const secret = await client.getSecret(secretName);

    if (!secret.value) {
      throw new Error(`Secreto ${secretName} está vacío en Key Vault`);
    }

    return secret.value;
  } catch (error) {
    throw new Error(`No se pudo obtener la contraseña del Key Vault para ${countryCode}: ${error}`);
  }
}

/**
 * Verifica si un secreto existe en Key Vault.
 */
export async function secretExists(secretName: string): Promise<boolean> {
  try {
    const client = getSecretClient();
    await client.getSecret(secretName);
    return true;
  } catch {
    return false;
  }
}
