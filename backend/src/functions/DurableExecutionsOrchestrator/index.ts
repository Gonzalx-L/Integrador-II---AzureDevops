import * as df from "durable-functions";
import { OrchestrationContext, OrchestrationHandler } from "durable-functions";

/**
 * DurableExecutionsOrchestrator — Durable Orchestrator
 * Coordina el flujo completo de procesamiento para un país.
 * Llama a la Activity Function para subir archivos pendientes al storage.
 */
const orchestrator: OrchestrationHandler = function* (context: OrchestrationContext) {
  const input = context.df.getInput() as {
    countryCode: string;
    storagePath: string;
    triggeredAt: string;
  };

  context.df.setCustomStatus({
    status: "INICIADO",
    countryCode: input.countryCode,
    triggeredAt: input.triggeredAt
  });

  try {
    // Llamar a la Activity para procesar los archivos del país
    const result = yield context.df.callActivity("DurableExecutions", {
      countryCode: input.countryCode,
      storagePath: input.storagePath,
      triggeredAt: input.triggeredAt
    });

    context.df.setCustomStatus({
      status: "COMPLETADO",
      countryCode: input.countryCode,
      processedFiles: result.processedFiles,
      completedAt: new Date().toISOString()
    });

    return {
      success: true,
      countryCode: input.countryCode,
      result
    };

  } catch (error: any) {
    context.df.setCustomStatus({
      status: "ERROR",
      countryCode: input.countryCode,
      error: error.message
    });

    return {
      success: false,
      countryCode: input.countryCode,
      error: error.message
    };
  }
};

df.app.orchestration("DurableExecutionsOrchestrator", orchestrator);
