# Activación de Azure Defender — Día de la Demo

> Tiempo estimado: 20 minutos antes de presentar  
> Costo estimado: < $0.50 USD (proporcional al día)  
> Acordate de apagarlo el mismo día al terminar

---

## Contexto

El código ya está listo. Hay dos funciones conviviendo:

| Función | Cuándo actúa |
|---|---|
| `OnDefenderScanResultQueue` | Cuando `DEFENDER_MOCK=true` (desarrollo local) |
| `OnDefenderEventGrid` | Cuando Defender real está activo y publica en Event Grid |

No hay que cambiar nada en el código. Solo activar Defender y conectar el Event Grid.

---

## PASO 1 — Habilitar Malware Scanning en el Storage Account

1. Ir al [Portal de Azure](https://portal.azure.com)
2. Buscar el storage account: **`sttransferenciaarchivos`**
3. En el menú izquierdo → **Microsoft Defender for Cloud**
4. Hacer clic en **"Enable"** (o "Habilitar")
5. Asegurarse que esté activado:
   - ✅ **Defender for Storage** → On
   - ✅ **Malware Scanning** → On
6. Guardar

> ⚠️ Solo activarlo en `sttransferenciaarchivos`. El `stdocumentoscolab` no necesita Defender porque ahí solo llegan archivos ya limpios.

---

## PASO 2 — Conectar Defender con el Event Grid Topic

Cuando Defender termina de escanear un blob, publica el resultado en un Event Grid.  
Hay que suscribir ese evento a la Azure Function `OnDefenderEventGrid`.

1. En el Portal → buscar **Event Grid Topics**
2. Abrir: **`evgt-transferenciaarch-dev`**
3. Ir a **"Event Subscriptions"** → **"+ Event Subscription"**
4. Completar el formulario:

| Campo | Valor |
|---|---|
| Name | `sub-defender-malware-result` |
| Event Schema | Event Grid Schema |
| Filter to Event Types | `Microsoft.Security.MalwareScanningResult` |
| Endpoint Type | **Azure Function** |
| Endpoint | Seleccionar `func-docucolab-dev` → función `OnDefenderEventGrid` |

5. Crear la suscripción

---

## PASO 3 — Configurar el Storage Account para publicar en Event Grid

Defender necesita saber a qué Event Grid Topic publicar el resultado.

1. Ir al storage account **`sttransferenciaarchivos`**
2. Microsoft Defender for Cloud → configuración avanzada
3. En "Malware Scanning" → "Send scan results to" → elegir **Event Grid Topic**
4. Seleccionar: **`evgt-transferenciaarch-dev`**
5. Guardar

---

## PASO 4 — Desplegar el backend con la nueva función

La función `OnDefenderEventGrid` ya está en el código. Solo hay que deployar.

```bash
cd backend
npm run build
func azure functionapp publish func-docucolab-dev
```

Verificar en el portal que aparezca la función `OnDefenderEventGrid` en la lista.

---

## PASO 5 — Verificar que funciona (prueba rápida)

1. Abrir el frontend de DocuColab
2. Login con cualquier usuario (ej: `UploadPeru@lozano13al000hotmail.onmicrosoft.com`)
3. Subir un ZIP pequeño (un Word de una hoja comprimido)
4. Esperar ~30 segundos
5. Ir a **Documentos** — el estado debe cambiar de `⏳ Sin escanear` a `✅ Sin amenazas`

Si el estado no cambia en 2 minutos, revisar los logs de la Function App en el portal.

---

## Qué se ve en el frontend

### Tabla de Documentos
Cada archivo muestra el estado real que escribió Defender:

| Estado | Qué significa |
|---|---|
| ✅ Sin amenazas | Defender escaneó y no encontró nada |
| 🚫 Malicioso | Defender detectó malware o ransomware |
| ⚠️ Sospechoso | Comportamiento anómalo, requiere revisión |
| 🔍 Escaneando | Defender está procesando |
| ⏳ Sin escanear | Blob recién subido, aún no escaneado |

### Reporte PDF
Cada archivo tiene un botón **"📄 PDF"** que genera un reporte con:
- Nombre, región, tamaño, fecha/hora local del país
- Estado de Defender con color (verde/rojo/naranja)
- Descripción en español de lo que encontró

### Dashboard de inicio
Las tarjetas de estadísticas se actualizan con los conteos reales:
- Documentos subidos
- Sin amenazas (No threats found)
- Maliciosos / Error
- Escaneando / Sin escanear

---

## PASO 6 — Apagar Defender al terminar

1. Portal de Azure → **`sttransferenciaarchivos`**
2. Microsoft Defender for Cloud → **Off**
3. Guardar

Factura final: proporcional a las horas activo. Si lo usás 4 horas de un mes de 720 horas → `$10 × (4/720)` = **$0.055 USD** + scanning (`~$0.00015 USD`).

---

## Resumen de lo que ya está listo en el código

| Archivo | Estado |
|---|---|
| `backend/src/functions/OnDefenderEventGrid/index.ts` | ✅ Nuevo — recibe eventos reales de Defender |
| `backend/src/functions/OnDefenderScanResultQueue/index.ts` | ✅ Sin cambios — sigue siendo el mock para dev |
| `backend/src/index.ts` | ✅ Registra ambas funciones |
| `backend/src/functions/OnCleanZipFromQueue/index.ts` | ✅ Sin cambios — procesa limpios igual |
| `backend/src/functions/OnErrorZipFromQueue/index.ts` | ✅ Sin cambios — procesa errores igual |
| `frontend/src/pages/DashboardPage.tsx` | ✅ Ya muestra estados reales de Defender |

No hay nada más que cambiar en el código. Todo listo para el día de la demo.
