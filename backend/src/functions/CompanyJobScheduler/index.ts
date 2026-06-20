import { app, InvocationContext, Timer } from "@azure/functions";
import * as df from "durable-functions";
import { getCountriesToProcess } from "../../utils/timezoneHelper";

/**
 * CompanyJobScheduler — Timer Trigger
 * Se ejecuta cada 5 minutos y verifica qué países deben procesar archivos ahora
 * según su zona horaria local. Solo dispara el orquestador para los países
 * cuya hora local sea la hora de ejecución configurada (08:00).
 */
export async function companyJobScheduler(
  myTimer: Timer,
  context: InvocationContext
): Promise<void> {
  context.log("CompanyJobScheduler iniciado —", new Date().toISOString());

  const countriesToProcess = getCountriesToProcess();

  if (countriesToProcess.length === 0) {
    context.log("No hay países que procesar en este momento.");
    return;
  }

  context.log(`Países a procesar: ${countriesToProcess.map(c => c.code).join(", ")}`);

  // Obtener el cliente del orquestador Durable
  const client = df.getClient(context);

  for (const country of countriesToProcess) {
    const instanceId = `${country.code}-${new Date().toISOString().split("T")[0]}`;

    context.log(`Iniciando orquestación para ${country.name} | instanceId: ${instanceId}`);

    await client.startNew("DurableExecutionsOrchestrator", {
      instanceId,
      input: {
        countryCode: country.code,
        storagePath: country.storagePath,
        triggeredAt: new Date().toISOString()
      }
    });
  }
}

app.timer("CompanyJobScheduler", {
  schedule: "0 */5 * * * *", // Cada 5 minutos
  handler: companyJobScheduler,
  extraInputs: [df.input.durableClient()]
});
