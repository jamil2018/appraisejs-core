import { type PackageManager } from './project.js';
import { type TemplateStepInstallPayload } from './types.js';
export declare function writePayloadToTempFile(payload: TemplateStepInstallPayload): Promise<string>;
export declare function removeTempPayloadFile(filePath: string): Promise<void>;
export declare function runLocalInstaller(packageManager: PackageManager, cwd: string, payloadFile: string, overwrite: boolean, dryRun: boolean): Promise<void>;
//# sourceMappingURL=installer.d.ts.map