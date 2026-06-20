// Entry point — registra todas las Azure Functions
// Azure Functions v4 requiere que todas las funciones
// se importen desde el archivo apuntado en "main" del package.json

import "./functions/CompanyJobScheduler/index";
import "./functions/DurableExecutionsOrchestrator/index";
import "./functions/DurableExecutions/index";
import "./functions/OnDefenderScanResultQueue/index";
import "./functions/OnCleanZipFromQueue/index";
import "./functions/OnProtecedZipFromQueue/index";
import "./functions/OnErrorZipFromQueue/index";
import "./functions/UploadZip/index";
import "./functions/GetDocuments/index";
import "./functions/GetPipelineStatus/index";
