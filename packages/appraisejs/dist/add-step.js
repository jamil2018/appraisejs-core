import { downloadStepPayload, fetchRegistryManifest, resolveStepEntry } from './registry.js';
import { runLocalInstaller, removeTempPayloadFile, writePayloadToTempFile } from './installer.js';
import { validateAppraiseProject } from './project.js';
const defaultDependencies = {
    fetchRegistryManifest,
    downloadStepPayload,
    resolveStepEntry,
    validateAppraiseProject,
    writePayloadToTempFile,
    runLocalInstaller,
    removeTempPayloadFile,
    log: message => console.log(message),
};
export async function addStepBySlug(slug, options, dependencies = defaultDependencies) {
    const project = await dependencies.validateAppraiseProject(options.cwd);
    const { manifest, manifestUrl } = await dependencies.fetchRegistryManifest(options.branch, options.registryUrl, fetch, options.useBundledRegistry);
    const entry = dependencies.resolveStepEntry(manifest, slug);
    const payload = await dependencies.downloadStepPayload(manifestUrl, entry);
    const payloadFile = await dependencies.writePayloadToTempFile(payload);
    try {
        dependencies.log(`Installing ${entry.slug} into ${project.root}`);
        await dependencies.runLocalInstaller(project.packageManager, project.root, payloadFile, options.overwrite, options.dryRun);
    }
    finally {
        await dependencies.removeTempPayloadFile(payloadFile);
    }
}
//# sourceMappingURL=add-step.js.map