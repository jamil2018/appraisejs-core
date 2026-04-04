import { promises as fs } from 'fs';
import { createHash } from 'crypto';
const DEFAULT_REGISTRY_REPO_BASE_URL = 'https://raw.githubusercontent.com/jamil2018/appraisejs-core';
const DEFAULT_REGISTRY_DIR = 'packages/appraisejs/registry/template-steps';
export function resolveBundledManifestUrl() {
    return new URL('../registry/template-steps/manifest.json', import.meta.url);
}
export function resolveManifestUrl(branch, registryUrl, useBundledRegistry = true) {
    if (registryUrl) {
        return registryUrl.endsWith('.json') ? new URL(registryUrl) : new URL(`${trimTrailingSlash(registryUrl)}/manifest.json`);
    }
    if (useBundledRegistry) {
        return resolveBundledManifestUrl();
    }
    return new URL(`${DEFAULT_REGISTRY_REPO_BASE_URL}/${branch}/${DEFAULT_REGISTRY_DIR}/manifest.json`);
}
function trimTrailingSlash(value) {
    return value.replace(/\/+$/g, '');
}
export async function fetchJson(url, fetchFn = fetch) {
    if (url.protocol === 'file:') {
        return JSON.parse(await fs.readFile(url, 'utf8'));
    }
    const response = await fetchFn(url, {
        headers: {
            accept: 'application/json',
        },
    });
    if (!response.ok) {
        throw new Error(`Request failed for ${url.toString()} (${response.status} ${response.statusText})`);
    }
    return (await response.json());
}
export async function fetchText(url, fetchFn = fetch) {
    if (url.protocol === 'file:') {
        return await fs.readFile(url, 'utf8');
    }
    const response = await fetchFn(url, {
        headers: {
            accept: 'text/plain, application/typescript;q=0.9, */*;q=0.1',
        },
    });
    if (!response.ok) {
        throw new Error(`Request failed for ${url.toString()} (${response.status} ${response.statusText})`);
    }
    return await response.text();
}
export async function fetchRegistryManifest(branch, registryUrl, fetchFn = fetch, useBundledRegistry = true) {
    const manifestUrl = resolveManifestUrl(branch, registryUrl, useBundledRegistry);
    const manifest = await fetchJson(manifestUrl, fetchFn);
    if (manifest.version !== 1 || !Array.isArray(manifest.steps)) {
        throw new Error(`Unsupported registry manifest at ${manifestUrl.toString()}`);
    }
    return { manifest, manifestUrl };
}
export function resolveStepEntry(manifest, slug) {
    const entry = manifest.steps.find(step => step.slug === slug);
    if (!entry) {
        throw new Error(`Step "${slug}" was not found in the registry manifest.`);
    }
    return entry;
}
export async function downloadStepPayload(manifestUrl, entry, fetchFn = fetch) {
    const sourceUrl = new URL(entry.sourcePath, manifestUrl);
    const source = await fetchText(sourceUrl, fetchFn);
    const normalizedSource = source.endsWith('\n') ? source : `${source}\n`;
    const actualSha = createHash('sha256').update(normalizedSource).digest('hex');
    if (actualSha !== entry.sourceSha256) {
        throw new Error(`Checksum mismatch for ${entry.slug}. Expected ${entry.sourceSha256}, received ${actualSha}.`);
    }
    return {
        version: 1,
        step: entry,
        source,
    };
}
//# sourceMappingURL=registry.js.map