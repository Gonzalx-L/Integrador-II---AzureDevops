# Activación de Azure Defender — Día de la Demo

> Tiempo estimado: 20 minutos antes de presentar  
> Costo estimado: < $0.50 USD (proporcional al día)  
> Acordate de apagarlo el mismo día al terminar

---

## Estado actual del proyecto

✅ Código desplegado en producción (`func-docucolab-dev.azurewebsites.net`)  
✅ Frontend desplegado en Azure Static Web Apps  
✅ Función `OnDefenderEventGrid` lista en el backend  
✅ El resto del pipeline (colas, blobs, Key Vault) ya funciona  

**Solo faltan 3 pasos en el Portal de Azure. Nada de código.**

---

## PASO 1 — Activar Defender en el Storage Account

1. Ir a [portal.azure.com](https://portal.azure.com)
2. Buscar y abrir: **`sttransferenciaarchivos`**
3. En el menú izquierdo → **Microsoft Defender for Cloud**
4. Hacer clic en **Enable**
5. Activar:
   - ✅ Defender for Storage → **On**
   - ✅ Malware Scanning → **On**
6. Guardar

> Solo activarlo en `sttransferenciaarchivos`. El `stdocumentoscolab` no lo necesita.

---

## PASO 2 — Configurar que Defender publique en Event Grid

1. Seguir en **`sttransferenciaarchivos`** → Microsoft Defender for Cloud
2. Buscar la sección **Malware Scanning** → configuración avanzada
3. En **"Send scan results to"** → seleccionar **Event Grid Topic**
4. Elegir: **`evgt-transferenciaarch-dev`**
5. Guardar

---

## PASO 3 — Crear la suscripción en Event Grid

1. En el Portal buscar: **Event Grid Topics**
2. Abrir: **`evgt-transferenciaarch-dev`**
3. Ir a **Event Subscriptions** → **+ Event Subscription**
4. Completar:

| Campo | Valor |
|---|---|
| Name | `sub-defender-malware-result` |
| Event Schema | Event Grid Schema |
| Filter to Event Types | `Microsoft.Security.MalwareScanningResult` |
| Endpoint Type | **Azure Function** |
| Endpoint | `func-docucolab-dev` → función `OnDefenderEventGrid` |

5. Crear

---

## Eso es todo. Así funciona el flujo completo

```
Subís un ZIP desde el frontend
        ↓
Llega a sttransferenciaarchivos (Blob Storage)
        ↓
Defender lo escanea automáticamente (~30 segundos)
        ↓
Publica resultado en evgt-transferenciaarch-dev (Event Grid)
        ↓
OnDefenderEventGrid recibe el evento
        ↓
Encola en queue-zip-limpios o queue-zip-error
        ↓
OnCleanZipFromQueue / OnErrorZipFromQueue procesan el archivo
        ↓
El estado aparece en el frontend: ✅ Sin amenazas / 🚫 Malicioso
```

---

## Qué se ve en el frontend

**Tabla de Documentos** — estado real de Defender por archivo:

| Estado | Significado |
|---|---|
| ✅ Sin amenazas | Defender escaneó y no encontró nada |
| 🚫 Malicioso | Defender detectó malware o ransomware |
| ⚠️ Sospechoso | Comportamiento anómalo |
| 🔍 Escaneando | Defender está procesando |
| ⏳ Sin escanear | Blob recién subido, aún no procesado |

**Reporte PDF** — botón 📄 PDF por cada archivo, incluye el resultado de Defender con color y descripción en español.

**Dashboard de inicio** — tarjetas con conteo real de archivos limpios, maliciosos y pendientes.

---

## Al terminar la demo — apagar Defender

1. Portal → **`sttransferenciaarchivos`** → Microsoft Defender for Cloud
2. Toggle → **Off**
3. Guardar

Factura final proporcional: si lo usás 4 horas → **~$0.06 USD**.

---

## Resumen de archivos tocados

| Archivo | Qué hace |
|---|---|
| `backend/src/functions/OnDefenderEventGrid/index.ts` | Recibe eventos reales de Defender vía Event Grid |
| `backend/src/functions/OnDefenderScanResultQueue/index.ts` | Mock para desarrollo local (sin cambios) |
| `backend/src/index.ts` | Registra ambas funciones |
| `.github/workflows/deploy.yml` | Deploy corregido — ya no falla el backend |
