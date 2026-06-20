#!/bin/bash
# =============================================================================
# deploy.sh — Script de infraestructura para DocuColab
# Bluetab Solutions Perú — Proyecto Académico UTP
#
# Uso:
#   1. az login
#   2. bash infra/deploy.sh
#
# Crea todos los recursos Azure con los nombres exactos del proyecto.
# =============================================================================

set -e  # Detener si algún comando falla

# ─── VARIABLES ────────────────────────────────────────────────────────────────
RESOURCE_GROUP="rg-bluetab-docucolab-dev"
LOCATION="eastus"
STORAGE_TRANSFERENCIA="sttransferenciaarchivosdev"
STORAGE_DOCUMENTOS="stdocumentocolaboradordev"
KEYVAULT_NAME="kv-documentocolab-dev"
EVENT_GRID_TOPIC="evgt-transferenciaarch-dev"
FUNCTION_APP_PLAN="plan-docucolab-dev"
FUNCTION_APP_NAME="func-docucolab-dev"
APP_SERVICE_PLAN="plan-frontend-docucolab"
WEB_APP_NAME="app-docucolab-dev"

echo "============================================================"
echo " DocuColab — Deploy de Infraestructura Azure"
echo " Resource Group: $RESOURCE_GROUP"
echo " Ubicación: $LOCATION"
echo "============================================================"

# ─── 1. RESOURCE GROUP ────────────────────────────────────────────────────────
echo ""
echo "[1/9] Creando Resource Group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output table

# ─── 2. STORAGE ACCOUNT — TRANSFERENCIA ───────────────────────────────────────
echo ""
echo "[2/9] Creando Storage Account de transferencia..."
az storage account create \
  --name "$STORAGE_TRANSFERENCIA" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --allow-blob-public-access false \
  --output table

# Crear contenedor de transferencia (privado)
STORAGE_TRANSFERENCIA_KEY=$(az storage account keys list \
  --resource-group "$RESOURCE_GROUP" \
  --account-name "$STORAGE_TRANSFERENCIA" \
  --query "[0].value" -o tsv)

az storage container create \
  --name "transferencia-archivos" \
  --account-name "$STORAGE_TRANSFERENCIA" \
  --account-key "$STORAGE_TRANSFERENCIA_KEY" \
  --public-access off

echo "Contenedor 'transferencia-archivos' creado."

# Crear las 4 colas
for QUEUE in "queue-zip-scan" "queue-zip-limpios" "queue-zip-protegidos" "queue-zip-error"; do
  az storage queue create \
    --name "$QUEUE" \
    --account-name "$STORAGE_TRANSFERENCIA" \
    --account-key "$STORAGE_TRANSFERENCIA_KEY"
  echo "Cola '$QUEUE' creada."
done

# ─── 3. STORAGE ACCOUNT — DOCUMENTOS ──────────────────────────────────────────
echo ""
echo "[3/9] Creando Storage Account de documentos..."
az storage account create \
  --name "$STORAGE_DOCUMENTOS" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --allow-blob-public-access false \
  --output table

STORAGE_DOCUMENTOS_KEY=$(az storage account keys list \
  --resource-group "$RESOURCE_GROUP" \
  --account-name "$STORAGE_DOCUMENTOS" \
  --query "[0].value" -o tsv)

az storage container create \
  --name "documentos" \
  --account-name "$STORAGE_DOCUMENTOS" \
  --account-key "$STORAGE_DOCUMENTOS_KEY" \
  --public-access off

echo "Contenedor 'documentos' creado."

# ─── 4. KEY VAULT ─────────────────────────────────────────────────────────────
echo ""
echo "[4/9] Creando Key Vault..."
az keyvault create \
  --name "$KEYVAULT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku standard \
  --output table

# Agregar secretos de ejemplo para cada país
echo "Agregando secretos de contraseñas ZIP por país..."
az keyvault secret set --vault-name "$KEYVAULT_NAME" --name "zip-password-BLUETAB-PERU"          --value "PasswordPeru2024!"
az keyvault secret set --vault-name "$KEYVAULT_NAME" --name "zip-password-BLUETAB-ESPANA"        --value "PasswordEspana2024!"
az keyvault secret set --vault-name "$KEYVAULT_NAME" --name "zip-password-BLUETAB-ARGENTINA"     --value "PasswordArgentina2024!"
az keyvault secret set --vault-name "$KEYVAULT_NAME" --name "zip-password-BLUETAB-NUEVA-ZELANDA" --value "PasswordNuevaZelanda2024!"
echo "Secretos creados. IMPORTANTE: Cambiar estas contraseñas antes de la demo."

# ─── 5. EVENT GRID TOPIC ──────────────────────────────────────────────────────
echo ""
echo "[5/9] Creando Event Grid Topic..."
az eventgrid topic create \
  --name "$EVENT_GRID_TOPIC" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output table

# ─── 6. FUNCTION APP ──────────────────────────────────────────────────────────
echo ""
echo "[6/9] Creando Function App..."

# Plan de consumo (serverless - gratis)
az functionapp create \
  --resource-group "$RESOURCE_GROUP" \
  --consumption-plan-location "$LOCATION" \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --name "$FUNCTION_APP_NAME" \
  --storage-account "$STORAGE_TRANSFERENCIA" \
  --os-type Linux \
  --output table

# Obtener connection strings
CONN_TRANSFERENCIA=$(az storage account show-connection-string \
  --resource-group "$RESOURCE_GROUP" \
  --name "$STORAGE_TRANSFERENCIA" \
  --query connectionString -o tsv)

CONN_DOCUMENTOS=$(az storage account show-connection-string \
  --resource-group "$RESOURCE_GROUP" \
  --name "$STORAGE_DOCUMENTOS" \
  --query connectionString -o tsv)

EVENT_GRID_ENDPOINT=$(az eventgrid topic show \
  --name "$EVENT_GRID_TOPIC" \
  --resource-group "$RESOURCE_GROUP" \
  --query endpoint -o tsv)

EVENT_GRID_KEY=$(az eventgrid topic key list \
  --name "$EVENT_GRID_TOPIC" \
  --resource-group "$RESOURCE_GROUP" \
  --query key1 -o tsv)

KEYVAULT_URL="https://${KEYVAULT_NAME}.vault.azure.net/"

# Configurar variables de entorno en la Function App
az functionapp config appsettings set \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    "STORAGE_TRANSFERENCIA_CONNECTION=$CONN_TRANSFERENCIA" \
    "STORAGE_DOCUMENTOS_CONNECTION=$CONN_DOCUMENTOS" \
    "KEYVAULT_URL=$KEYVAULT_URL" \
    "EVENT_GRID_TOPIC_ENDPOINT=$EVENT_GRID_ENDPOINT" \
    "EVENT_GRID_TOPIC_KEY=$EVENT_GRID_KEY" \
    "CONTAINER_TRANSFERENCIA=transferencia-archivos" \
    "CONTAINER_DOCUMENTOS=documentos" \
    "QUEUE_SCAN=queue-zip-scan" \
    "QUEUE_LIMPIOS=queue-zip-limpios" \
    "QUEUE_PROTEGIDOS=queue-zip-protegidos" \
    "QUEUE_ERROR=queue-zip-error" \
    "DEFENDER_MOCK=false" \
  --output table

echo "Function App configurada."

# ─── 7. MANAGED IDENTITY para Key Vault ───────────────────────────────────────
echo ""
echo "[7/9] Configurando Managed Identity para acceso a Key Vault..."

az functionapp identity assign \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --output table

PRINCIPAL_ID=$(az functionapp identity show \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query principalId -o tsv)

az keyvault set-policy \
  --name "$KEYVAULT_NAME" \
  --object-id "$PRINCIPAL_ID" \
  --secret-permissions get list \
  --output table

echo "Managed Identity configurada con acceso a Key Vault."

# ─── 8. APP SERVICE para Frontend ─────────────────────────────────────────────
echo ""
echo "[8/9] Creando App Service para el frontend (tier F1 - gratis)..."

az appservice plan create \
  --name "$APP_SERVICE_PLAN" \
  --resource-group "$RESOURCE_GROUP" \
  --sku F1 \
  --is-linux \
  --output table

az webapp create \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --name "$WEB_APP_NAME" \
  --runtime "NODE:18-lts" \
  --output table

echo "Frontend App Service creado."

# ─── 9. RESUMEN ───────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " ✅ INFRAESTRUCTURA CREADA EXITOSAMENTE"
echo "============================================================"
echo ""
echo "Recursos creados:"
echo "  Storage Transferencia : $STORAGE_TRANSFERENCIA"
echo "  Storage Documentos    : $STORAGE_DOCUMENTOS"
echo "  Key Vault             : $KEYVAULT_NAME"
echo "  Event Grid Topic      : $EVENT_GRID_TOPIC"
echo "  Function App          : $FUNCTION_APP_NAME"
echo "  Web App (frontend)    : $WEB_APP_NAME"
echo ""
echo "URLs:"
echo "  Function App : https://${FUNCTION_APP_NAME}.azurewebsites.net"
echo "  Frontend     : https://${WEB_APP_NAME}.azurewebsites.net"
echo "  Key Vault    : $KEYVAULT_URL"
echo ""
echo "⚠️  IMPORTANTE: Cambiar las contraseñas de ejemplo en Key Vault antes de la demo."
echo "============================================================"
