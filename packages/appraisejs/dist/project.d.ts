export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type AppraiseProjectInfo = {
    root: string;
    packageManager: PackageManager;
    packageJsonPath: string;
};
export declare function validateAppraiseProject(projectRoot: string): Promise<AppraiseProjectInfo>;
export declare function detectPackageManager(projectRoot: string): PackageManager;
//# sourceMappingURL=project.d.ts.map