import { chromium } from 'playwright';
import { appendLocatorPickerCrashLog, createLocatorPickerCrashLog, ensureLocatorPickerDirectories, getLocatorPickerCrashLogPath, patchLocatorPickerSessionFile, readLocatorPickerSessionFile, writeLocatorPickerSessionFile, } from './session-file.js';
import { generatePickedLocatorPayload } from './selector-generator.js';
import { installLocatorPickerOverlay } from './injected-picker-script.js';
function parseArgs(argv) {
    var _a, _b, _c, _d;
    const values = new Map();
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {
            continue;
        }
        values.set(token, (_a = argv[index + 1]) !== null && _a !== void 0 ? _a : '');
        index += 1;
    }
    const sessionId = (_b = values.get('--session-id')) === null || _b === void 0 ? void 0 : _b.trim();
    const sessionFile = (_c = values.get('--session-file')) === null || _c === void 0 ? void 0 : _c.trim();
    const targetUrl = (_d = values.get('--target-url')) === null || _d === void 0 ? void 0 : _d.trim();
    if (!sessionId || !sessionFile || !targetUrl) {
        throw new Error('Missing required arguments: --session-id, --session-file, --target-url.');
    }
    return {
        sessionId,
        sessionFile,
        targetUrl,
    };
}
function normalizeRoute(value) {
    if (!value) {
        return '/';
    }
    try {
        return new URL(value).pathname || '/';
    }
    catch (_a) {
        return value.startsWith('/') ? value : `/${value}`;
    }
}
class LocatorPickerCompanion {
    constructor(options) {
        this.browser = null;
        this.context = null;
        this.finalized = false;
        this.shuttingDown = false;
        this.requestedExitCode = 0;
        this.sessionId = options.sessionId;
        this.sessionFile = options.sessionFile;
        this.targetUrl = options.targetUrl;
        this.crashLogPath = getLocatorPickerCrashLogPath(options.sessionId);
    }
    get exitCode() {
        return this.requestedExitCode;
    }
    getLaunchCandidates() {
        const sharedOptions = {
            args: [
                '--disable-background-networking',
                '--disable-component-update',
                '--disable-default-apps',
                '--disable-sync',
                '--no-default-browser-check',
                '--no-first-run',
            ],
            headless: false,
        };
        const bundledChromium = {
            label: 'playwright-chromium',
            options: sharedOptions,
        };
        const systemChrome = {
            label: 'google-chrome',
            options: Object.assign(Object.assign({}, sharedOptions), { channel: 'chrome' }),
        };
        const systemEdge = {
            label: 'microsoft-edge',
            options: Object.assign(Object.assign({}, sharedOptions), { channel: 'msedge' }),
        };
        return [bundledChromium, systemChrome, systemEdge];
    }
    async launchBrowser() {
        const failures = [];
        for (const candidate of this.getLaunchCandidates()) {
            try {
                const browser = await chromium.launch(candidate.options);
                const context = await browser.newContext({
                    ignoreHTTPSErrors: true,
                });
                return { browser, context };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                failures.push(`${candidate.label}: ${message}`);
            }
        }
        throw new Error(failures.join('\n\n'));
    }
    async ensureOverlayInstalled(page) {
        if (page.isClosed()) {
            return;
        }
        await page.evaluate(installLocatorPickerOverlay).catch(() => undefined);
    }
    async writeCrashLog(message) {
        await appendLocatorPickerCrashLog(this.crashLogPath, message).catch(() => undefined);
    }
    async run() {
        var _a;
        await ensureLocatorPickerDirectories(process.cwd());
        await createLocatorPickerCrashLog(this.crashLogPath);
        await this.writeCrashLog(`Companion booting for ${this.targetUrl}.`);
        await patchLocatorPickerSessionFile(this.sessionFile, {
            companionPid: process.pid,
            crashLogPath: this.crashLogPath,
            error: undefined,
        });
        process.on('SIGTERM', () => {
            void this.writeCrashLog('Received SIGTERM.');
            void this.shutdown('closed');
        });
        process.on('SIGINT', () => {
            void this.writeCrashLog('Received SIGINT.');
            void this.shutdown('closed');
        });
        process.on('uncaughtException', error => {
            void this.writeCrashLog(`Uncaught exception: ${error instanceof Error ? error.stack || error.message : String(error)}`);
            void this.shutdown('error');
            process.exitCode = 1;
        });
        process.on('unhandledRejection', reason => {
            const details = reason instanceof Error ? reason.stack || reason.message : String(reason);
            void this.writeCrashLog(`Unhandled rejection: ${details}`);
            void this.shutdown('error');
            process.exitCode = 1;
        });
        try {
            const launchedBrowser = await this.launchBrowser();
            this.browser = launchedBrowser.browser;
            this.context = launchedBrowser.context;
            await this.context.exposeBinding('__appraiseLocatorPickerPreview', async ({ page }, elementHandle) => {
                return this.generatePreview(page, elementHandle);
            }, { handle: true });
            await this.context.exposeBinding('__appraiseLocatorPickerConfirm', async (_source, payload) => {
                await this.confirmSelection(payload);
            });
            await this.context.exposeBinding('__appraiseLocatorPickerCancel', async () => {
                await this.shutdown('closed');
            });
            await this.context.addInitScript(installLocatorPickerOverlay);
            this.context.on('page', page => {
                this.attachPage(page);
            });
            for (const page of this.context.pages()) {
                this.attachPage(page);
            }
            const page = (_a = this.context.pages().find(candidate => !candidate.isClosed())) !== null && _a !== void 0 ? _a : (await this.context.newPage());
            await page.goto(this.targetUrl, { waitUntil: 'domcontentloaded' });
            await this.ensureOverlayInstalled(page);
            await this.writePageState(page, 'ready');
            await this.context.waitForEvent('close', { timeout: 0 });
            if (!this.finalized) {
                await this.shutdown('closed');
            }
            await this.writeCrashLog(this.finalized
                ? 'Companion finished cleanly after locator selection.'
                : 'Companion closed cleanly without runtime errors.');
        }
        catch (error) {
            this.requestedExitCode = 1;
            await this.writeCrashLog(`Companion startup failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
            await this.markError(error instanceof Error && error.message.includes("Executable doesn't exist")
                ? 'Playwright Chromium is not installed. Run `npm run install-playwright -- chromium` and retry.'
                : error instanceof Error
                    ? error.message
                    : 'Failed to start the locator picker companion.');
            process.exitCode = 1;
        }
    }
    attachPage(page) {
        const refresh = () => {
            void (async () => {
                await this.ensureOverlayInstalled(page);
                await this.writePageState(page, this.finalized ? 'picked' : 'ready');
            })();
        };
        page.on('domcontentloaded', refresh);
        page.on('load', refresh);
        page.on('framenavigated', frame => {
            if (frame === page.mainFrame()) {
                refresh();
            }
        });
        page.on('close', () => {
            void this.handlePageClose();
        });
    }
    async writePageState(page, status) {
        if (page.isClosed()) {
            return;
        }
        const currentUrl = page.url();
        const pageTitle = await page.title().catch(() => '');
        await patchLocatorPickerSessionFile(this.sessionFile, current => ({
            status: current.status === 'saving' ? 'saving' : status,
            currentUrl,
            currentPathname: normalizeRoute(currentUrl),
            pageTitle,
            companionPid: process.pid,
            error: undefined,
        }));
    }
    async generatePreview(page, elementHandle) {
        if (!page || page.isClosed()) {
            throw new Error('The page is no longer available for picking.');
        }
        return generatePickedLocatorPayload(page, elementHandle);
    }
    async confirmSelection(payload) {
        this.finalized = true;
        this.requestedExitCode = 0;
        await patchLocatorPickerSessionFile(this.sessionFile, current => ({
            status: current.status === 'saving' ? 'saving' : 'picked',
            currentUrl: payload.currentUrl,
            currentPathname: payload.pathname,
            pageTitle: payload.pageTitle,
            pickedLocator: payload,
            error: undefined,
            companionPid: process.pid,
        }));
        await this.closeContext();
    }
    async handlePageClose() {
        if (this.finalized || this.shuttingDown || !this.context) {
            return;
        }
        const openPages = this.context.pages().filter(page => !page.isClosed());
        if (openPages.length === 0) {
            await this.shutdown('closed');
        }
    }
    async closeContext() {
        const currentContext = this.context;
        const currentBrowser = this.browser;
        this.context = null;
        this.browser = null;
        await (currentContext === null || currentContext === void 0 ? void 0 : currentContext.close().catch(() => undefined));
        await (currentBrowser === null || currentBrowser === void 0 ? void 0 : currentBrowser.close().catch(() => undefined));
    }
    async markError(message) {
        this.finalized = false;
        this.requestedExitCode = 1;
        await this.writeCrashLog(`Marked session as error: ${message}`);
        await patchLocatorPickerSessionFile(this.sessionFile, {
            status: 'error',
            error: message,
            companionPid: process.pid,
        });
    }
    async shutdown(status) {
        if (this.shuttingDown) {
            return;
        }
        this.shuttingDown = true;
        this.requestedExitCode = status === 'error' ? 1 : 0;
        await this.writeCrashLog(`Shutdown requested with status ${status}.`);
        if (!this.finalized) {
            await patchLocatorPickerSessionFile(this.sessionFile, current => ({
                status: current.status === 'saving' ? 'saving' : status,
                companionPid: process.pid,
            }));
        }
        await this.closeContext();
    }
}
async function main() {
    const options = parseArgs(process.argv.slice(2));
    const existingSession = await readLocatorPickerSessionFile(options.sessionFile);
    if (!existingSession) {
        throw new Error(`Locator picker session file not found: ${options.sessionFile}`);
    }
    await writeLocatorPickerSessionFile(options.sessionFile, Object.assign(Object.assign({}, existingSession), { companionPid: process.pid, crashLogPath: existingSession.crashLogPath || getLocatorPickerCrashLogPath(options.sessionId), error: undefined }));
    const companion = new LocatorPickerCompanion(options);
    await companion.run();
    process.exit(companion.exitCode);
}
void main().catch(async (error) => {
    const argv = process.argv.slice(2);
    const sessionFileIndex = argv.findIndex(token => token === '--session-file');
    const sessionFile = sessionFileIndex >= 0 ? argv[sessionFileIndex + 1] : undefined;
    const sessionIdIndex = argv.findIndex(token => token === '--session-id');
    const sessionId = sessionIdIndex >= 0 ? argv[sessionIdIndex + 1] : undefined;
    if (sessionFile) {
        await patchLocatorPickerSessionFile(sessionFile, {
            status: 'error',
            error: error instanceof Error ? error.message : 'Locator picker companion failed.',
            companionPid: process.pid,
        }).catch(() => undefined);
    }
    if (sessionId) {
        await appendLocatorPickerCrashLog(getLocatorPickerCrashLogPath(sessionId), `Main process catch: ${error instanceof Error ? error.stack || error.message : String(error)}`).catch(() => undefined);
    }
    process.exitCode = 1;
});
