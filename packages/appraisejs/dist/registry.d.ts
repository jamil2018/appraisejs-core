import { type RegistryStepEntry, type StepRegistryManifest, type TemplateStepInstallPayload } from './types.js';
export declare function resolveBundledManifestUrl(): URL;
export declare function resolveManifestUrl(branch: string, registryUrl?: string, useBundledRegistry?: boolean): URL;
export declare function fetchJson<T>(url: URL, fetchFn?: typeof fetch): Promise<T>;
export declare function fetchText(url: URL, fetchFn?: typeof fetch): Promise<string>;
export declare function fetchRegistryManifest(branch: string, registryUrl?: string, fetchFn?: typeof fetch, useBundledRegistry?: boolean): Promise<{
    manifest: StepRegistryManifest;
    manifestUrl: URL;
}>;
export declare function resolveStepEntry(manifest: StepRegistryManifest, slug: string): RegistryStepEntry;
export declare function downloadStepPayload(manifestUrl: URL, entry: RegistryStepEntry, fetchFn?: typeof fetch): Promise<TemplateStepInstallPayload>;
//# sourceMappingURL=registry.d.ts.map