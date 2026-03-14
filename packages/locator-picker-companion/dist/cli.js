import { chromium } from 'playwright';
import path from 'path';
import { ensureLocatorPickerDirectories, patchLocatorPickerSessionFile, readLocatorPickerSessionFile, writeLocatorPickerSessionFile, } from './session-file.js';
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
        this.context = null;
        this.finalized = false;
        this.shuttingDown = false;
        this.sessionFile = options.sessionFile;
        this.targetUrl = options.targetUrl;
    }
    async ensureOverlayInstalled(page) {
        if (page.isClosed()) {
            return;
        }
        await page.evaluate(installLocatorPickerOverlay).catch(() => undefined);
    }
    async run() {
        var _a;
        await ensureLocatorPickerDirectories(process.cwd());
        await patchLocatorPickerSessionFile(this.sessionFile, {
            companionPid: process.pid,
            error: undefined,
        });
        process.on('SIGTERM', () => {
            void this.shutdown('closed');
        });
        process.on('SIGINT', () => {
            void this.shutdown('closed');
        });
        const profileDir = path.join(process.cwd(), '.tmp', 'locator-picker', 'profiles', path.basename(this.sessionFile, '.json'));
        try {
            this.context = await chromium.launchPersistentContext(profileDir, {
                headless: false,
                channel: 'chromium',
                ignoreHTTPSErrors: true,
            });
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
        }
        catch (error) {
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
        if (!this.context) {
            return;
        }
        const currentContext = this.context;
        this.context = null;
        await currentContext.close().catch(() => undefined);
    }
    async markError(message) {
        this.finalized = false;
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
    await writeLocatorPickerSessionFile(options.sessionFile, Object.assign(Object.assign({}, existingSession), { companionPid: process.pid, error: undefined }));
    const companion = new LocatorPickerCompanion(options);
    await companion.run();
}
void main().catch(async (error) => {
    const argv = process.argv.slice(2);
    const sessionFileIndex = argv.findIndex(token => token === '--session-file');
    const sessionFile = sessionFileIndex >= 0 ? argv[sessionFileIndex + 1] : undefined;
    if (sessionFile) {
        await patchLocatorPickerSessionFile(sessionFile, {
            status: 'error',
            error: error instanceof Error ? error.message : 'Locator picker companion failed.',
            companionPid: process.pid,
        }).catch(() => undefined);
    }
    process.exitCode = 1;
});
