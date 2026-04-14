export type TemplateStepIcon = 'MOUSE' | 'KEYBOARD' | 'ASSERTION' | 'NAVIGATION' | 'DATA' | 'VALIDATION';
export type TemplateStepGroupType = 'ACTION' | 'VALIDATION';
export type RegistryStepEntry = {
    slug: string;
    sourcePath: string;
    sourceSha256: string;
    signature: string;
    name: string;
    description: string | null;
    icon: TemplateStepIcon;
    group: {
        slug: string;
        name: string;
        description: string | null;
        type: TemplateStepGroupType;
    };
};
export type StepRegistryManifest = {
    version: 1;
    generatedAt: string;
    steps: RegistryStepEntry[];
};
export type TemplateStepInstallPayload = {
    version: 1;
    step: RegistryStepEntry;
    source: string;
};
export type AddStepOptions = {
    cwd: string;
    overwrite: boolean;
    dryRun: boolean;
    registryUrl?: string;
    branch: string;
    useBundledRegistry: boolean;
};
//# sourceMappingURL=types.d.ts.map