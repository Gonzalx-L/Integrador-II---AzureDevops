# DocuColab — Sistema Automatizado de Procesamiento de Documentos
## Bluetab Solutions Perú | Proyecto Académico UTP — Noveno Ciclo

---

## 1. Descripción General

DocuColab es un sistema que automatiza la recepción, escaneo de seguridad, clasificación y almacenamiento de archivos ZIP enviados mensualmente por colaboradores de Bluetab Solutions en múltiples países (Perú, España, Argentina, Nueva Zelanda, entre otros).

El sistema maneja zonas horarias automáticamente: cada país tiene configurada una hora local de ejecución, y el pipeline solo se dispara cuando corresponde según el huso horario de cada sede.

Todo el flujo corre sobre Azure Functions con el patrón Durable Functions para orquestación, y usa Storage Queues + Event Grid + Key Vault para distribuir y proteger los archivos según su estado.

---

## 2. Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Lenguaje | Node.js / TypeScript |
| Backend | Azure Functions (Durable Functions + Queue Triggers) |
| Almacenamiento | Azure Blob Storage |
| Mensajería | Azure Queue Storage |
| Eventos | Azure Event Grid |
| Seguridad de archivos | Azure Defender for Storage (mock en dev, real en demo) |
| Secretos | Azure Key Vault |
| Autenticación | Azure AD B2C (Sprint 4) |
| Frontend | HTML/JS (mockups existentes adaptados) |
| CI/CD | Azure Pipelines (Azure DevOps) |
| Entorno local | VS Code + Azurite + ngrok + Azure CLI |
| Gestión del proyecto | Azure DevOps Boards (Scrum — 36 work items) |

---

## 3. Equipo

| Persona | Rol |
|---|---|
| Gonzalo | Owner de suscripción Azure — control total de recursos y créditos |
| Compañero | Owner del Resource Group del proyecto |

---

## 4. Arquitectura del Pipeline

### Flujo completo

```
FUENTE DE ORIGEN (usuario sube ZIP desde el frontend)
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  CompanyJobScheduler  (Timer Trigger)               │
│  → Detecta zona horaria de cada sede                │
│  → Solo ejecuta cuando es la hora local configurada │
│    Perú      UTC-5  → 8:00am = 13:00 UTC            │
│    España    UTC+1  → 8:00am = 07:00 UTC            │
│    Argentina UTC-3  → 8:00am = 11:00 UTC            │
│    Nueva Zelanda UTC+13 → 8:00am = 19:00 UTC prev.  │
└─────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  DurableExecutionsOrchestrator  (Durable Orchestrator)│
│  → Coordina todo el flujo                           │
│        │                                            │
│        ▼                                            │
│  DurableExecutions  (Durable Activity)              │
│  → Guarda el ZIP en Blob Storage                    │
│    sttransferenciaarchivosdev                       │
│    transferencia-archivos/MENSUALES/BLUETAB_PERU/   │
└─────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  Event Grid: evgt-transferenciaarch-dev             │
│  → Se dispara al detectar BlobCreated               │
│  → Azure Defender escanea el archivo                │
│    (mock en desarrollo, real en demo)               │
│  → Publica resultado en: queue-zip-scan             │
└─────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  OnDefenderScanResultQueue  (Queue Trigger)         │
│  → Lee queue-zip-scan                               │
│  → Clasifica el archivo en 3 ramas                 │
└─────────────────────────────────────────────────────┘
        │
        ├──────────────────┬──────────────────┐
        ▼                  ▼                  ▼
   LIMPIO              PROTEGIDO           ERROR
   (sin password,      (ZIP con            (corrupto,
    sin amenaza)        password)           amenaza, inválido)
        │                  │                  │
        ▼                  ▼                  ▼
queue-zip-limpios  queue-zip-protegidos  queue-zip-error
        │                  │                  │
        ▼                  ▼                  ▼
OnCleanZipFromQueue OnProtecedZipFromQueue OnErrorZipFromQueue
        │                  │                  │
        ▼                  ▼                  ▼
MENSUALES/          Key Vault             MENSUALES/
BLUETAB_PERU/       kv-documentocolab-dev BLUETAB_PERU/
DESBLOQUEADOS/      → obtiene password    ERROR/
        │           → desbloquea ZIP
        ▼           → descomprime
stdocumentocolab    → re-escanea Defender
adordev             → reempaqueta limpio
documentos/         → guarda en:
BLUETAB_PERU/       documentos/
MENSUALES/          BLUETAB_PERU/
                    MENSUALES/
```

---

## 5. Inventario de Recursos Azure

### Function Apps (7 funciones)

| Nombre | Tipo |
|---|---|
| CompanyJobScheduler | Timer Trigger |
| DurableExecutionsOrchestrator | Durable Orchestrator |
| DurableExecutions | Durable Activity |
| OnDefenderScanResultQueue | Queue Trigger |
| OnCleanZipFromQueue | Queue Trigger |
| OnProtecedZipFromQueue | Queue Trigger |
| OnErrorZipFromQueue | Queue Trigger |

### Storage Accounts

| Nombre | Contenedor | Uso |
|---|---|---|
| sttransferenciaarchivosdev | transferencia-archivos | Recepción de ZIPs entrantes |
| stdocumentocolaboradordev | documentos | Almacenamiento final de documentos procesados |

### Queues (Azure Queue Storage)

| Cola | Propósito |
|---|---|
| queue-zip-scan | Resultado del escaneo de Defender |
| queue-zip-limpios | Archivos sin password y sin amenazas |
| queue-zip-protegidos | Archivos ZIP con contraseña |
| queue-zip-error | Archivos con error, corruptos o con amenaza |

### Otros Recursos

| Recurso | Nombre | Uso |
|---|---|---|
| Event Grid Topic | evgt-transferenciaarch-dev | Captura evento BlobCreated y dispara escaneo |
| Key Vault | kv-documentocolab-dev | Almacena contraseñas cifradas de ZIPs protegidos |
| Azure Defender | (servicio managed) | Escaneo antivirus/seguridad de archivos |

### Rutas de Storage por País

```
transferencia-archivos/
  MENSUALES/
    BLUETAB_PERU/
    BLUETAB_ESPAÑA/
    BLUETAB_ARGENTINA/
    BLUETAB_NUEVAZELANDA/
      ├── (ZIPs entrantes)
      ├── DESBLOQUEADOS/
      └── ERROR/

documentos/
  BLUETAB_PERU/
  BLUETAB_ESPAÑA/
  BLUETAB_ARGENTINA/
  BLUETAB_NUEVAZELANDA/
    └── MENSUALES/
```

---

## 6. Frontend (DocuColab)

Interfaz web con dos pantallas principales basadas en mockups existentes:

### Login
- Autenticación con Azure AD B2C
- Diseño: mockup HTML existente (DocuColab branding)

### Dashboard Admin
- Visualización de archivos procesados por país y estado
- Tabla con columnas: Empresa, País, Fecha, Estado (LIMPIO / PROTEGIDO / ERROR), Acciones
- Botón para subir nuevo ZIP
- Filtros por país, estado y fecha
- Logs de actividad en tiempo real

---

## 7. Estructura del Repositorio (Monorepo)

```
bluetab-docucolab/
  ├── backend/
  │     ├── src/
  │     │     ├── functions/
  │     │     │     ├── CompanyJobScheduler/
  │     │     │     ├── DurableExecutionsOrchestrator/
  │     │     │     ├── DurableExecutions/
  │     │     │     ├── OnDefenderScanResultQueue/
  │     │     │     ├── OnCleanZipFromQueue/
  │     │     │     ├── OnProtecedZipFromQueue/
  │     │     │     └── OnErrorZipFromQueue/
  │     │     ├── utils/
  │     │     │     ├── timezoneHelper.ts
  │     │     │     ├── blobHelper.ts
  │     │     │     ├── queueHelper.ts
  │     │     │     ├── keyVaultHelper.ts
  │     │     │     └── defenderMock.ts
  │     │     └── config/
  │     │           └── countries.ts
  │     ├── local.settings.json
  │     ├── host.json
  │     ├── package.json
  │     └── tsconfig.json
  ├── frontend/
  │     ├── login.html
  │     ├── dashboard.html
  │     ├── css/
  │     └── js/
  │           ├── auth.js
  │           ├── dashboard.js
  │           └── upload.js
  ├── infra/
  │     └── azure-resources.md
  ├── .azure/
  │     └── pipelines/
  │           └── azure-pipelines.yml
  └── PROYECTO.md
```

---

## 8. Plan de Sprints

| Sprint | Semana | Objetivo | Estado |
|---|---|---|---|
| Sprint 1 | 1 | Requerimientos + Arquitectura draw.io + 4 mockups HTML | ✅ Completado |
| Sprint 2 | 2 | Setup entorno local: VS Code, Azurite, ngrok, Azure CLI, TypeScript | ⏳ Pendiente |
| Sprint 3 | 3 | Pipeline completo de Azure Functions — probado local con Azurite + ngrok | 🔄 En curso |
| Sprint 4 | 4 | Table Storage + Autenticación Azure AD B2C | ⏳ Pendiente |
| Sprint 5 | 5 | Frontend real + Dashboard Admin conectado al backend | ⏳ Pendiente |
| Sprint 6 | 6 | CI/CD Azure Pipelines + Deploy a Azure real + Demo final | ⏳ Pendiente |

---

## 9. Costos Estimados

| Recurso | Costo en desarrollo | Costo en demo |
|---|---|---|
| Azure Functions | $0 (1M ejecuciones gratis) | $0 |
| Blob Storage | $0 (5GB gratis 12 meses) | $0 |
| Queue Storage | $0 (incluido en Storage) | $0 |
| Event Grid | $0 (100K ops gratis) | $0 |
| Key Vault | $0 (10K ops gratis) | $0 |
| App Service (frontend) | $0 (tier F1 gratis) | $0 |
| Azure DevOps | $0 (hasta 5 usuarios gratis) | $0 |
| **Azure Defender** | **$0 (mock/simulado)** | **~$0.50 por pocas horas** |
| **TOTAL** | **$0** | **< $1** |

---

## 10. Entorno de Desarrollo Local

### PASO 0 — Habilitar ejecución de scripts en PowerShell (solo primera vez)

Abrir PowerShell como **Administrador** y ejecutar:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Confirmar con `S` cuando lo pida.

---

### PASO 1 — Instalar herramientas globales

Ejecutar en orden en PowerShell o CMD como Administrador:

```bash
# 1. Azure Functions Core Tools v4
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# 2. Azurite (emulador local de Azure Storage)
npm install -g azurite

# 3. TypeScript global (compilador)
npm install -g typescript

# 4. Azure CLI
# Descargar instalador desde:
# https://aka.ms/installazurecliwindows
# Ejecutar el .msi y seguir el asistente

# 5. ngrok (expone el puerto local a internet para Event Grid)
# Descargar desde: https://ngrok.com/download
# Extraer ngrok.exe y agregarlo al PATH, o colocarlo en la carpeta del proyecto
```

---

### PASO 2 — Verificar instalaciones

```bash
node --version          # Debe mostrar v18.x o superior
npm --version           # Debe mostrar 9.x o superior
func --version          # Debe mostrar 4.x.x
az --version            # Debe mostrar azure-cli 2.x
azurite --version       # Debe mostrar 3.x.x
ngrok version           # Debe mostrar ngrok v3.x
tsc --version           # Debe mostrar Version 5.x
```

---

### PASO 3 — Instalar dependencias del proyecto (backend)

```bash
cd backend
npm install
```

#### Dependencias del backend (se instalan automáticamente con npm install)

| Paquete | Versión | Para qué |
|---|---|---|
| `@azure/functions` | `^4.0.0` | Azure Functions runtime |
| `durable-functions` | `^3.0.0` | Durable Orchestrator + Activity |
| `@azure/storage-blob` | `^12.0.0` | Leer/escribir en Blob Storage |
| `@azure/storage-queue` | `^12.0.0` | Enviar/leer mensajes de colas |
| `@azure/keyvault-secrets` | `^4.0.0` | Leer secretos desde Key Vault |
| `@azure/identity` | `^4.0.0` | Autenticación con Azure AD/Managed Identity |
| `adm-zip` | `^0.5.10` | Comprimir/descomprimir ZIPs con y sin contraseña |
| `luxon` | `^3.0.0` | Manejo de zonas horarias por país |
| `uuid` | `^9.0.0` | Generación de IDs únicos para cada archivo |

#### Dependencias de desarrollo

| Paquete | Para qué |
|---|---|
| `typescript` | Compilador TypeScript |
| `@types/node` | Tipos de Node.js |
| `@types/adm-zip` | Tipos para adm-zip |
| `@types/luxon` | Tipos para luxon |
| `@types/uuid` | Tipos para uuid |

---

### PASO 4 — Levantar entorno local

```bash
# Terminal 1 — Azurite (emula Storage + Queues + Tables)
azurite --silent --location ./azurite-data --loose

# Terminal 2 — ngrok (expone el puerto 7071 local a internet)
ngrok http 7071

# Terminal 3 — Azure Functions
cd backend
func start
```

---

### Herramientas necesarias — resumen de verificación

```bash
node --version          # Node.js 18+
func --version          # Azure Functions Core Tools 4.x
az --version            # Azure CLI
azurite --version       # Emulador de Storage
ngrok version           # Expone Event Grid local a internet
tsc --version           # TypeScript compiler
```

---

## 11. Variables de Entorno (local.settings.json)

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "STORAGE_CONNECTION": "UseDevelopmentStorage=true",
    "KEYVAULT_URL": "https://kv-documentocolab-dev.vault.azure.net/",
    "EVENT_GRID_TOPIC_ENDPOINT": "https://evgt-transferenciaarch-dev...",
    "EVENT_GRID_TOPIC_KEY": "<key>",
    "DEFENDER_MOCK": "true"
  }
}
```

---

## 12. APF2 — Segunda Presentación

Requisitos para la segunda entrega (APF2):

- [ ] Levantamiento de observaciones del APF1
- [ ] Integración con base de datos (Azure Table Storage)
- [ ] Controles de seguridad implementados
- [ ] Retrospectiva del Sprint 4
- [ ] Validación del servicio en Azure real

---

## 13. Siguiente Paso Inmediato

Generar el código completo del proyecto:

1. Scaffolding del monorepo TypeScript + Azure Functions
2. Las 7 functions del pipeline con toda la lógica
3. Utilidades: timezone, blob, queue, keyvault, defender mock
4. Frontend: login.html + dashboard.html conectados al backend
5. Configuración de Azurite para pruebas locales
6. Pipeline de Azure DevOps (azure-pipelines.yml)

---

## 14. Lineamiento de Implementación — Historial de Documentos y Carga de Archivos

> Decisiones tomadas y reglas fijas que NO deben cambiarse sin consenso del equipo.

### 14.1 Cuenta de Almacenamiento y Ruta de Lectura

El dashboard debe leer los documentos **únicamente** desde:

```
Storage Account : sttransferenciaarchivos
Contenedor      : transferencia-archivos
Ruta fija       : MENSUALES/BLUETAB_PERU/
```

Solo se listan archivos `.zip` dentro de esa ruta. No se listan subcarpetas ni otros tipos de archivo.

### 14.2 Estados de Azure Defender for Storage

Los estados que se muestran en la tabla de documentos son **exactamente los que Azure Defender escribe** en los tags del blob bajo la clave `"Malware Scanning Result"`. No se inventan estados propios.

| Estado Defender | Significado | Color en UI |
|---|---|---|
| `Unscanned` | Blob recién subido, Defender aún no lo procesó | Gris |
| `Scanning` | Defender está analizando el archivo en este momento | Azul |
| `No threats found` | Escaneo completado, archivo limpio | Verde |
| `Suspicious` | Comportamiento sospechoso, requiere revisión manual | Naranja |
| `Malicious` | Amenaza confirmada detectada por Defender | Rojo |

Si el blob no tiene el tag (Defender no habilitado o muy reciente), se muestra `Unscanned` por defecto.

### 14.3 Subida de Archivos

- Solo se aceptan archivos con extensión `.zip`. Cualquier otro tipo debe ser rechazado tanto en frontend (validación en dropzone y `<input accept=".zip">`) como en backend (validación en `UploadZip`).
- El archivo se sube a la ruta: `MENSUALES/BLUETAB_PERU/{uuid}_{nombre_original}.zip`
- El contenedor destino es `transferencia-archivos` en `sttransferenciaarchivos`.

### 14.4 Variables de Entorno Definitivas (local.settings.json)

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "CONTAINER_TRANSFERENCIA": "transferencia-archivos",
    "STORAGE_TRANSFERENCIA_CONNECTION": "<connection-string de sttransferenciaarchivos>"
  },
  "Host": {
    "LocalHttpPort": 7071,
    "CORS": "http://localhost:5173",
    "CORSCredentials": false
  }
}
```

> La connection string real de `sttransferenciaarchivos` se obtiene con:
> ```bash
> az storage account show-connection-string --name sttransferenciaarchivos --resource-group rg-bluetab-docucolab-dev --query connectionString -o tsv
> ```

### 14.5 Lógica del Endpoint GET /api/documents

1. Conectar a `sttransferenciaarchivos` usando `STORAGE_TRANSFERENCIA_CONNECTION`
2. Listar blobs en `transferencia-archivos` con prefix `MENSUALES/BLUETAB_PERU/`
3. Filtrar solo archivos `.zip` (ignorar subcarpetas y archivos `.error.json`)
4. Leer el tag `"Malware Scanning Result"` de cada blob → ese es el estado
5. Si el tag no existe → estado = `"Unscanned"`
6. Retornar lista ordenada por `lastModified` descendente

### 14.6 Reglas de Frontend

- El dropzone y el `<input>` de archivo solo aceptan `.zip` (`accept=".zip"`)
- Si el usuario intenta subir otro tipo, mostrar error: `"Solo se permiten archivos .ZIP"`
- La tabla de documentos usa `StatusPill` con los 5 estados de Defender (ver 14.2)
- Los filtros de la tabla deben coincidir exactamente con los nombres de estado de Defender
- El polling de documentos se hace cada 15 segundos (`setInterval(fetchDocs, 15000)`)
