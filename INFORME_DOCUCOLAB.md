# INFORME ACADÉMICO — SISTEMAS DE INFORMACIÓN EMPRESARIALES

---

## CARÁTULA

| | |
|---|---|
| **Proyecto** | DocuColab — Sistema Automatizado de Procesamiento de Documentos |
| **Curso** | Sistemas de Información Empresariales |
| **Institución** | Universidad Tecnológica del Perú (UTP) |
| **Ciclo** | Noveno Ciclo |
| **Empresa analizada** | Bluetab Solutions Perú (IBM Company) |
| **Enfoque** | Diseño conceptual e implementación de un sistema de información |
| **Integrantes** | Gonzalo / [Nombre del compañero] |
| **Fecha** | Julio 2026 |

---

## TABLA DE CONTENIDOS

1. [Introducción](#1-introducción)
2. [Empresa / Contexto](#2-empresa--contexto)
3. [Problema Identificado](#3-problema-identificado)
4. [Análisis del Sistema Actual](#4-análisis-del-sistema-actual)
5. [Propuesta de Solución](#5-propuesta-de-solución)
6. [Diseño / Modelo del Sistema](#6-diseño--modelo-del-sistema)
7. [Beneficios Esperados](#7-beneficios-esperados)
8. [Conclusiones](#8-conclusiones)
9. [Referencias](#9-referencias)

---

## 1. Introducción

En el contexto actual de la transformación digital empresarial, la gestión eficiente de documentos e información constituye un factor crítico para la operación de organizaciones multinacionales. Bluetab Solutions, empresa de consultoría tecnológica con presencia en múltiples países de Latinoamérica y Europa, enfrenta el desafío de coordinar el flujo mensual de documentación generada por sus distintas sedes, garantizando integridad, seguridad y trazabilidad en cada etapa del proceso.

El presente informe analiza la problemática asociada al proceso manual de recepción y procesamiento de archivos documentales comprimidos (formato ZIP) que los colaboradores de cada sede envían mensualmente. A partir de dicho análisis, se formula e implementa **DocuColab**: un sistema de información orientado a la automatización completa de ese flujo, apoyado en tecnologías de nube de Microsoft Azure.

El enfoque adoptado corresponde al de **diseño conceptual e implementación de un sistema de información**, abarcando desde la identificación del problema hasta el despliegue funcional de la solución en un entorno cloud.

---

## 2. Empresa / Contexto

### 2.1 Presentación de la organización

**Bluetab Solutions** es una empresa de consultoría especializada en transformación digital, datos e inteligencia artificial. Fundada en España, fue adquirida por IBM y opera actualmente como "Bluetab an IBM Company". Cuenta con presencia en:

- **Perú** (sede principal para este análisis)
- **España**
- **Argentina**
- **Nueva Zelanda**

### 2.2 Giro de negocio

Bluetab Solutions ofrece servicios de:

- Consultoría en arquitectura de datos y sistemas empresariales
- Implementación de plataformas de datos (Data Lakes, Data Warehouses)
- Proyectos de Business Intelligence y Analytics
- Transformación digital para clientes del sector financiero, retail y energía

### 2.3 Tamaño y principales actividades

La organización opera con equipos distribuidos en sus cuatro sedes, coordinando proyectos para clientes externos e internos. Cada sede gestiona sus propios documentos operativos y reportes mensuales, que deben consolidarse y almacenarse de forma centralizada con garantías de seguridad.

### 2.4 Contexto del problema o necesidad identificada

El área de operaciones de Bluetab Solutions requiere que cada sede envíe mensualmente un paquete de documentos en formato ZIP. Este paquete puede incluir contratos, reportes de avance, políticas internas y documentación de proyectos. El proceso de recepción, validación y almacenamiento de estos archivos se realizaba de forma manual, generando demoras, inconsistencias y riesgos de seguridad.

---

## 3. Problema Identificado

### 3.1 Descripción del problema

El proceso de gestión documental mensual de Bluetab Solutions presentaba las siguientes deficiencias:

1. **Ausencia de automatización**: los archivos ZIP enviados por cada sede eran recibidos y procesados manualmente por el equipo de operaciones, sin flujos estandarizados.
2. **Falta de escaneo de seguridad sistemático**: no existía un mecanismo formal para detectar archivos maliciosos o corruptos antes de su almacenamiento definitivo.
3. **Gestión manual de ZIPs protegidos**: cuando un colaborador enviaba un archivo con contraseña, el proceso de desbloqueo y verificación dependía de comunicaciones informales (correo electrónico), con riesgo de exposición de credenciales.
4. **Sin diferenciación por zona horaria**: las sedes operan en husos horarios distintos (UTC-5 para Perú, UTC+1 para España, UTC-3 para Argentina, UTC+13 para Nueva Zelanda), y no existía un mecanismo que coordinara la ejecución del proceso según la hora local de cada sede.
5. **Sin visibilidad del estado del flujo**: no había una interfaz centralizada donde el administrador pudiera ver en tiempo real qué archivos habían sido procesados, cuáles estaban pendientes y cuáles habían fallado.

### 3.2 Evidencias que sustentan el problema

- Proceso documentado en reportes internos como enteramente manual, sin herramientas de automatización.
- Necesidad de mantener contraseñas de ZIPs en canales no seguros (correo, chat).
- Ausencia de registros de auditoría sobre qué archivos fueron recibidos, escaneados y almacenados.
- Tiempo promedio de procesamiento por lote: variable e impredecible según disponibilidad del equipo de operaciones.

### 3.3 Impacto en las operaciones

| Área afectada | Impacto |
|---|---|
| Seguridad | Riesgo de almacenamiento de archivos con malware o ransomware |
| Operaciones | Demoras en consolidación mensual de documentos |
| Cumplimiento | Sin trazabilidad ni auditoría del flujo documental |
| Recursos humanos | Horas-hombre dedicadas a tareas repetitivas y manuales |
| Coordinación internacional | Sin respeto a zonas horarias locales de cada sede |

---

## 4. Análisis del Sistema Actual

### 4.1 Descripción de los procesos involucrados

El proceso mensual de gestión documental involucra los siguientes pasos en su estado anterior (AS-IS):

**Figura 1 — Diagrama AS-IS (proceso manual previo)**

> 📎 Ver archivo: `diagrama_as_is.xml` (importar en draw.io)

```
[Colaborador de sede]
    │
    ▼ Envía ZIP por correo electrónico o carpeta compartida
[Operador de TI central]
    │
    ├─ ¿Tiene contraseña? → solicita por correo → espera respuesta → desbloquea manualmente
    │
    ├─ ¿Tiene virus? → antivirus manual del equipo local → resultado no centralizado
    │
    ▼
[Copia manual al servidor de archivos]
    │
    ▼
[Registro en hoja de cálculo Excel] → sin alertas, sin historial automatizado
```

**Problemas del proceso AS-IS:**
- Dependiente de personas específicas (single point of failure)
- Sin registro automático ni auditoría
- Tiempo de procesamiento: horas o días según carga del equipo
- Sin diferenciación de resultados (limpio / protegido / error)

### 4.2 Sistemas de información actualmente utilizados

Antes de DocuColab, el ecosistema de herramientas era:

| Sistema | Uso | Limitación |
|---|---|---|
| Correo electrónico (Outlook) | Recepción de archivos ZIP | Sin automatización, sin escaneo |
| Carpetas compartidas (SharePoint/OneDrive) | Almacenamiento | Sin clasificación automática |
| Antivirus local (Windows Defender) | Escaneo de archivos | Manual, no integrado al flujo |
| Hoja de cálculo (Excel) | Registro de documentos recibidos | Sin sincronización en tiempo real |

### 4.3 Flujos de información

El flujo de información en el sistema anterior era completamente lineal y manual:

```
Colaborador → [correo/carpeta] → Operador TI → [antivirus manual] 
→ [desbloqueo manual si tiene contraseña] → [copia al servidor] 
→ [registro en Excel] → Administrador consulta Excel
```

No existían notificaciones automáticas, ni estado en tiempo real, ni separación de responsabilidades entre recepción, escaneo y almacenamiento.

### 4.4 Fortalezas y debilidades del sistema existente

**Fortalezas:**
- Bajo costo inicial (sin infraestructura dedicada)
- Familiaridad del equipo con las herramientas usadas

**Debilidades:**
- Sin automatización de ninguna etapa
- Sin escaneo centralizado y auditado de seguridad
- Sin manejo seguro de contraseñas (expuestas en comunicaciones)
- Sin visibilidad del estado del proceso para el administrador
- Sin respeto a zonas horarias de cada sede
- Sin escalabilidad ante aumento de sedes o volumen documental
- Sin trazabilidad ni historial verificable

---

## 5. Propuesta de Solución

### 5.1 Tipo de sistema propuesto

**DocuColab** es un **sistema transaccional orientado a la integración de servicios cloud**, que implementa un pipeline automatizado de procesamiento documental sobre Microsoft Azure. Incorpora elementos de:

- **Sistema de gestión documental** (recepción, clasificación y almacenamiento de archivos)
- **Sistema de automatización de procesos** (event-driven, sin intervención manual)
- **Sistema de monitoreo y reporting** (dashboard con estado en tiempo real y reportes exportables)

### 5.2 Justificación

#### Razones por las que la solución es adecuada

1. **Elimina el trabajo manual repetitivo**: el pipeline completo (recepción → escaneo → clasificación → almacenamiento) se ejecuta automáticamente sin intervención humana.
2. **Garantiza seguridad en cada archivo**: Azure Defender for Storage analiza cada ZIP antes de su almacenamiento definitivo, detectando malware, ransomware y archivos peligrosos.
3. **Gestión segura de credenciales**: las contraseñas de ZIPs protegidos se almacenan en Azure Key Vault con control de acceso basado en identidad (Managed Identity), eliminando el intercambio inseguro de contraseñas.
4. **Respeta los husos horarios**: el scheduler utiliza la librería Luxon con zonas horarias IANA para disparar el pipeline exactamente a las 08:00 hora local de cada sede.
5. **Visibilidad total**: el dashboard React permite al administrador ver el estado de cada archivo en tiempo real, con el diagrama del pipeline animado que refleja el flujo actual.

#### Relación con los objetivos estratégicos

Bluetab Solutions, como empresa de consultoría en transformación digital, tiene como objetivo estratégico adoptar y demostrar internamente las prácticas que recomienda a sus clientes. DocuColab materializa esa coherencia: automatización de procesos con cloud-native architecture, seguridad por diseño y visibilidad operativa.

#### Viabilidad técnica

- **Stack probado**: Node.js 18 + TypeScript + Azure Functions v4 son tecnologías maduras con soporte de largo plazo de Microsoft.
- **Costo operativo**: la arquitectura serverless elimina costos fijos de infraestructura. En el nivel de uso del proyecto, todos los servicios Azure caen dentro de la capa gratuita o de bajo costo (estimado < $1 USD en demo, $0 en desarrollo).
- **Entorno local completo**: Azurite emula Storage y Queues localmente, permitiendo desarrollo sin costos cloud.
- **CI/CD configurado**: tanto Azure Pipelines como GitHub Actions están implementados para despliegue automático desde la rama `main`.

#### Viabilidad organizacional

- El equipo ya cuenta con acceso a la suscripción Azure necesaria.
- La interfaz web no requiere instalación en los equipos de los colaboradores.
- La autenticación usa las cuentas corporativas existentes (Azure AD), sin necesidad de gestionar nuevas credenciales.

---

## 6. Diseño / Modelo del Sistema

### 6.1 Diagrama de procesos TO-BE

**Figura 2 — Diagrama TO-BE (proceso automatizado con DocuColab)**

> 📎 Ver archivo: `diagrama_to_be.xml` (importar en draw.io)

El proceso TO-BE elimina toda intervención manual:

```
[Colaborador] 
    │ Login con cuenta Microsoft (Azure AD)
    ▼
[Frontend React — DocuColab]
    │ Selecciona país + arrastra ZIP → POST /api/upload
    ▼
[Azure Function: UploadZip]
    │ Valida formato y país → sube a Blob Storage → encola en queue-zip-scan
    ▼
[Azure Function: OnDefenderScanResultQueue]
    │ Descarga ZIP → escanea con Azure Defender
    ├─ CLEAN     → queue-zip-limpios
    ├─ PROTECTED → queue-zip-protegidos  
    └─ ERROR     → queue-zip-error
    ▼                    ▼                    ▼
[OnClean...]      [OnProtected...]      [OnError...]
Copia a           Key Vault →           Mueve a
DESBLOQUEADOS/    desbloquea →          ERROR/ con
+ documentos/     re-escanea →          log .json
                  documentos/
```

### 6.2 Arquitectura del sistema

**Figura 3 — Arquitectura general de DocuColab**

> 📎 Ver archivo: `diagrama_arquitectura.xml` (importar en draw.io)

La arquitectura se organiza en tres capas:

| Capa | Componentes |
|---|---|
| **Presentación** | React SPA (Vite), Azure Static Web Apps, MSAL auth |
| **Lógica de negocio** | Azure Functions v4 (10 funciones), Durable Functions |
| **Datos y servicios** | Blob Storage (×2), Queue Storage (×4), Key Vault, Azure Defender, Event Grid |

### 6.3 Modelo de datos simplificado

Los datos que fluyen por el sistema se estructuran en dos entidades principales:

**Tabla 1 — Estructura del mensaje de cola (QueueMessage)**

| Campo | Tipo | Descripción |
|---|---|---|
| `fileId` | UUID | Identificador único del archivo |
| `fileName` | string | Nombre del archivo con UUID prefijado |
| `blobPath` | string | Ruta completa en Blob Storage |
| `countryCode` | string | Código de sede (PERU, ESPANA, ARGENTINA, NUEVA_ZELANDA) |
| `uploadedAt` | ISO datetime | Timestamp de carga |
| `fileSize` | number | Tamaño en bytes |
| `scanResult` | enum | CLEAN / PROTECTED / ERROR |
| `scanDetails` | string | Descripción del resultado del escaneo |
| `scannedAt` | ISO datetime | Timestamp del escaneo |
| `isPasswordProtected` | boolean | Indica si el ZIP tenía contraseña |

**Tabla 2 — Estructura del documento en Blob Storage**

| Contenedor | Ruta | Estado del archivo |
|---|---|---|
| `transferencia-archivos` | `MENSUALES/{PAÍS}/` | Recién subido, pendiente de escaneo |
| `transferencia-archivos` | `MENSUALES/{PAÍS}/DESBLOQUEADOS/` | Limpio, procesado |
| `transferencia-archivos` | `MENSUALES/{PAÍS}/ERROR/` | Con errores o amenazas |
| `documentos` | `{PAÍS}/MENSUALES/` | Almacenamiento final definitivo |

### 6.4 Casos de uso principales

**Figura 4 — Diagrama de casos de uso**

> 📎 Ver archivo: `diagrama_casos_uso.xml` (importar en draw.io)

| Actor | Caso de uso |
|---|---|
| Colaborador | Autenticarse con cuenta Microsoft |
| Colaborador | Subir archivo ZIP mensual |
| Administrador | Ver dashboard de documentos |
| Administrador | Filtrar documentos por país y estado |
| Administrador | Exportar reporte de seguridad en PDF |
| Sistema (Timer) | Disparar pipeline automático a las 08:00 hora local por sede |
| Sistema (Defender) | Escanear archivo ZIP y publicar resultado |
| Sistema (Key Vault) | Proveer contraseña para desbloquear ZIP protegido |

### 6.5 Inventario de recursos Azure

**Tabla 3 — Recursos Azure del sistema DocuColab**

| Recurso | Nombre | Propósito |
|---|---|---|
| Function App | `func-docucolab-dev` | Backend — 10 Azure Functions |
| Static Web App | `swa-docucolab-dev` | Hosting del frontend React |
| Storage Account | `sttransferenciaarchivos` | Recepción de ZIPs y colas de mensajería |
| Storage Account | `stdocumentoscolab` | Almacenamiento final de documentos |
| Key Vault | `kv-docucolab-dev` | Contraseñas de ZIPs protegidos por sede |
| Event Grid Topic | `evgt-transferenciaarch-dev` | Captura evento BlobCreated |
| Azure AD (MSAL) | Tenant `5552ca21-...` | Autenticación de usuarios |

### 6.6 Diagrama de flujo del pipeline (detallado)

**Figura 5 — Pipeline completo de procesamiento**

> 📎 Ver archivo: `diagrama_pipeline.xml` (importar en draw.io)

```
┌─────────────────────────────────────────────────────────────────┐
│  ENTRADA: Colaborador sube ZIP desde el frontend                │
│  POST /api/upload — multipart/form-data (file + countryCode)    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  UploadZip  │  Azure Function HTTP Trigger
                    │  (HTTP)     │  Valida ZIP + país
                    └──────┬──────┘
                           │ uploadBlob() → MENSUALES/{PAÍS}/
                           │ sendQueueMessage() → queue-zip-scan
                    ┌──────▼───────────────────────┐
                    │  Azure Blob Storage           │
                    │  transferencia-archivos       │
                    │  MENSUALES/{PAÍS}/archivo.zip │
                    └──────┬───────────────────────┘
                           │ queue-zip-scan (mensaje)
          ┌────────────────▼─────────────────────┐
          │  OnDefenderScanResultQueue            │
          │  Queue Trigger                        │
          │  downloadBlob() → scanZipBuffer()     │
          └──┬──────────────┬───────────────┬────┘
             │              │               │
          CLEAN          PROTECTED        ERROR
             │              │               │
    ┌────────▼──┐  ┌────────▼──┐  ┌────────▼──┐
    │queue-zip  │  │queue-zip  │  │queue-zip  │
    │-limpios   │  │-protegidos│  │-error     │
    └────┬──────┘  └────┬──────┘  └────┬──────┘
         │              │               │
┌────────▼──────┐ ┌─────▼───────────┐ ┌▼──────────────┐
│OnCleanZip     │ │OnProtectedZip   │ │OnErrorZip     │
│FromQueue      │ │FromQueue        │ │FromQueue      │
│               │ │                 │ │               │
│→ DESBLOQUEADOS│ │→ Key Vault      │ │→ ERROR/       │
│→ documentos/  │ │  obtiene pwd    │ │  + .error.json│
│  {PAÍS}/      │ │→ unlockZip()    │ └───────────────┘
│  MENSUALES/   │ │→ re-escanea     │
└───────────────┘ │→ documentos/   │
                  │  {PAÍS}/       │
                  │  MENSUALES/    │
                  └────────────────┘

PARALELO — Timer automático (cada 5 minutos):
┌──────────────────────┐
│ CompanyJobScheduler  │  Timer Trigger
│ Luxon: ¿es 08:00     │  Schedule: "0 */5 * * * *"
│ hora local?          │
└──────┬───────────────┘
       │ Por cada sede que corresponda:
┌──────▼───────────────────────┐
│ DurableExecutionsOrchestrator│  Durable Orchestrator
└──────┬───────────────────────┘
       │
┌──────▼────────────┐
│ DurableExecutions │  Durable Activity
│ (Activity)        │  Registra archivos pendientes
└───────────────────┘
```

### 6.7 Mockups de la interfaz

El sistema cuenta con dos pantallas principales:

**Figura 6 — Pantalla de Login**

La pantalla de acceso muestra el branding de DocuColab y un único botón "Continuar con Microsoft" que redirige al flujo de autenticación de Azure AD. No se gestionan credenciales propias.

**Figura 7 — Dashboard del Administrador**

El dashboard incluye cuatro secciones navegables desde la barra lateral:

| Sección | Contenido |
|---|---|
| **Inicio** | Tarjetas de estadísticas + diagrama animado del pipeline en tiempo real |
| **Subir Archivo** | Dropzone + selector de país + tabla de últimos archivos |
| **Documentos** | Tabla paginada con filtros por estado y búsqueda por nombre |
| **Reportes** | Análisis de amenazas por mes, tipos de amenaza, historial + exportar PDF |

---

## 7. Beneficios Esperados

### 7.1 Beneficios operativos

| Beneficio | Indicador de mejora |
|---|---|
| Eliminación del procesamiento manual de archivos | 0 horas-hombre dedicadas al proceso de recepción y clasificación |
| Procesamiento disponible 24/7 | Uptime del pipeline: 99.9% (Azure SLA) |
| Respuesta inmediata al subir un archivo | Tiempo de escaneo y clasificación: < 60 segundos por archivo |
| Coordinación automática por zona horaria | Disparos del pipeline ajustados exactamente a las 08:00 hora local de cada sede |
| Reintento automático ante fallos | Azure Functions reintenta automáticamente los Queue Triggers ante errores transitorios |

### 7.2 Beneficios económicos

| Concepto | Antes (estimado) | Después |
|---|---|---|
| Horas-hombre por procesamiento mensual | ~4 hs/mes por operador | 0 hs/mes |
| Costo de infraestructura | Servidores on-premise o licencias de software | < $1 USD/mes en Azure |
| Incidentes por archivos maliciosos | Sin cuantificación formal | Detectados y aislados automáticamente |

### 7.3 Beneficios para la toma de decisiones

- El administrador accede en tiempo real al estado de cada archivo sin depender de reportes manuales.
- Los reportes de Azure Defender permiten identificar patrones de amenazas por sede y por período.
- El historial de procesamiento (blobs en Storage con timestamps) constituye una auditoría completa del flujo documental.
- La exportación a PDF del reporte de seguridad facilita la presentación a directivos y auditorías externas.

### 7.4 Beneficios para clientes y usuarios

| Usuario | Beneficio |
|---|---|
| Colaborador | Proceso de carga simple: login + seleccionar país + arrastrar ZIP |
| Administrador | Visibilidad completa del estado del flujo desde el dashboard |
| Área de seguridad | Todos los archivos son escaneados antes de almacenarse; las credenciales de ZIPs protegidos nunca circulan por canales inseguros |
| Auditoría interna | Registro automático de cada operación con timestamps y resultados |

### 7.5 Indicadores de mejora esperados

| Indicador | Línea base | Meta con DocuColab |
|---|---|---|
| Tiempo promedio de procesamiento por lote | 4-24 horas (manual) | < 2 minutos |
| Tasa de archivos escaneados antes del almacenamiento | 0% | 100% |
| Contraseñas de ZIPs expuestas en canales inseguros | Frecuente | 0 (gestionadas solo por Key Vault) |
| Visibilidad del estado del flujo en tiempo real | No disponible | Dashboard actualizado cada 15 segundos |
| Costo mensual de infraestructura del proceso | Variable (RRHH + servidores) | < $1 USD |

---

## 8. Conclusiones

### 8.1 Principales hallazgos del análisis

- El proceso manual de gestión documental de Bluetab Solutions presentaba deficiencias estructurales en seguridad, trazabilidad y eficiencia operativa, que se incrementaban con cada nueva sede incorporada.
- La ausencia de automatización generaba dependencia en personas específicas y exposición a errores humanos en tareas repetitivas.
- Los riesgos de seguridad eran concretos: sin escaneo sistemático, cualquier archivo ZIP podía ser almacenado y accedido sin haber pasado por ninguna validación de integridad.

### 8.2 Aporte de la propuesta planteada

DocuColab resuelve de forma integral el problema identificado mediante:

1. **Automatización completa** del pipeline de recepción, escaneo, clasificación y almacenamiento, sin intervención humana.
2. **Seguridad por diseño**: cada archivo pasa obligatoriamente por Azure Defender antes de su almacenamiento definitivo; las credenciales se gestionan exclusivamente en Key Vault.
3. **Arquitectura cloud-native escalable**: el modelo serverless permite incorporar nuevas sedes o tipos de archivos sin cambios de infraestructura.
4. **Observabilidad**: el dashboard en tiempo real y los reportes exportables eliminan la opacidad del proceso anterior.

La implementación sobre Azure Functions con el patrón Durable Functions y mensajería por colas representa una arquitectura robusta, desacoplada y resiliente, alineada con las mejores prácticas de la industria en sistemas distribuidos.

### 8.3 Recomendaciones finales

1. **Implementar Azure Table Storage** como registro histórico estructurado de cada operación del pipeline, para habilitar consultas analíticas más avanzadas.
2. **Activar Azure AD B2C** para la gestión de roles diferenciados (colaborador vs. administrador), restringiendo el acceso al dashboard según perfil.
3. **Incorporar Azure Monitor + Application Insights** para alertas automáticas ante fallas en el pipeline o volúmenes inusuales de errores.
4. **Extender el módulo de reportes** con integración a Power BI para análisis histórico de largo plazo por sede y tipo de archivo.
5. **Considerar Azure Defender for Storage en modo producción** (no mock) para el despliegue definitivo, garantizando detección de amenazas con el motor real de Microsoft.

---

## 9. Referencias

- Microsoft. (2024). *Azure Functions documentation*. https://learn.microsoft.com/en-us/azure/azure-functions/
- Microsoft. (2024). *Durable Functions overview*. https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview
- Microsoft. (2024). *Azure Key Vault documentation*. https://learn.microsoft.com/en-us/azure/key-vault/
- Microsoft. (2024). *Microsoft Defender for Storage*. https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-storage-introduction
- Microsoft. (2024). *Azure Queue Storage documentation*. https://learn.microsoft.com/en-us/azure/storage/queues/
- Microsoft. (2024). *MSAL for JavaScript — React*. https://learn.microsoft.com/en-us/entra/identity-platform/tutorial-v2-react
- Fowler, M. (2018). *Event-Driven Architecture*. martinfowler.com
- Richardson, C. (2019). *Microservices Patterns*. Manning Publications.

---

*Documento generado como parte del proyecto académico DocuColab — UTP Noveno Ciclo — 2026*
