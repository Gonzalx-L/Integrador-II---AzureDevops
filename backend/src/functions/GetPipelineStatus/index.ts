import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { QueueServiceClient } from "@azure/storage-queue";

/**
 * GetPipelineStatus — HTTP Trigger
 * Retorna el número de mensajes en cada cola del pipeline.
 * El frontend lo usa para activar/desactivar las animaciones del diagrama.
 *
 * GET /api/status
 */
export async function getPipelineStatus(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  const connectionString = process.env["STORAGE_TRANSFERENCIA_CONNECTION"];
  if (!connectionString) {
    return { status: 500, headers: corsHeaders, jsonBody: { error: "Storage connection not configured" } };
  }

  try {
    const queueService = QueueServiceClient.fromConnectionString(connectionString);

    const queues = [
      { name: process.env["QUEUE_SCAN"]       || "queue-zip-scan",       key: "scan"       },
      { name: process.env["QUEUE_LIMPIOS"]    || "queue-zip-limpios",    key: "limpios"    },
      { name: process.env["QUEUE_PROTEGIDOS"] || "queue-zip-protegidos", key: "protegidos" },
      { name: process.env["QUEUE_ERROR"]      || "queue-zip-error",      key: "error"      },
    ];

    const counts: Record<string, number> = {};

    for (const q of queues) {
      try {
        const queueClient = queueService.getQueueClient(q.name);
        const props = await queueClient.getProperties();
        counts[q.key] = props.approximateMessagesCount ?? 0;
      } catch {
        counts[q.key] = 0;
      }
    }

    // Estado de cada segmento del pipeline
    const status = {
      queues: counts,
      segments: {
        // true = hay mensajes viajando por ese segmento
        timerToOrchestrator:   false,          // el timer no deja rastro en cola
        orchestratorToStorage: false,          // durable no expone cola directa
        storageToDefender:     counts.scan > 0,
        defenderToClassifier:  counts.scan > 0,
        classifierToLimpios:   counts.limpios > 0,
        classifierToProtegidos:counts.protegidos > 0,
        classifierToError:     counts.error > 0,
        limpiosToStorage:      counts.limpios > 0,
        protegidosToKeyVault:  counts.protegidos > 0,
        errorToFolder:         counts.error > 0,
      },
      activeNodes: {
        timer:       true,
        orchestrator:true,
        activity:    true,
        storage:     true,
        defender:    counts.scan > 0,
        queueScan:   counts.scan > 0,
        classifier:  counts.scan > 0,
        queueLimpios:   counts.limpios > 0,
        queueProtegidos:counts.protegidos > 0,
        queueError:     counts.error > 0,
        fnLimpios:      counts.limpios > 0,
        fnProtegidos:   counts.protegidos > 0,
        fnError:        counts.error > 0,
        keyVault:       counts.protegidos > 0,
        storageDest:    counts.limpios > 0,
        storageError:   counts.error > 0,
      },
      updatedAt: new Date().toISOString()
    };

    return { status: 200, headers: corsHeaders, jsonBody: status };

  } catch (error: any) {
    context.error(`Error en GetPipelineStatus: ${error.message}`);
    return { status: 500, headers: corsHeaders, jsonBody: { error: error.message } };
  }
}

app.http("GetPipelineStatus", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "status",
  handler: getPipelineStatus
});
