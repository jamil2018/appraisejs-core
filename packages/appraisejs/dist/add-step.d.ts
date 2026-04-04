import { downloadStepPayload, fetchRegistryManifest, resolveStepEntry } from './registry.js';
import { runLocalInstaller, removeTempPayloadFile, writePayloadToTempFile } from './installer.js';
import { validateAppraiseProject } from './project.js';
import { type AddStepOptions } from './types.js';
export type AddStepDependencies = {
    fetchRegistryManifest: typeof fetchRegistryManifest;
    downloadStepPayload: typeof downloadStepPayload;
    resolveStepEntry: typeof resolveStepEntry;
    validateAppraiseProject: typeof validateAppraiseProject;
    writePayloadToTempFile: typeof writePayloadToTempFile;
    runLocalInstaller: typeof runLocalInstaller;
    removeTempPayloadFile: typeof removeTempPayloadFile;
    log(message: string): void;
};
export declare function addStepBySlug(slug: string, options: AddStepOptions, dependencies?: AddStepDependencies): Promise<void>;
//# sourceMappingURL=add-step.d.ts.map