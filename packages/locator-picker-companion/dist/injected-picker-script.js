export function installLocatorPickerOverlay() {
    var _a;
    const globalState = window;
    const ROOT_ID = 'appraise-locator-picker-root';
    const STYLE_ID = 'appraise-locator-picker-style';
    const HOVER_CLASS = 'appraise-locator-picker-hover';
    const ACTIVE_CLASS = 'appraise-locator-picker-active';
    const state = (_a = globalState.__appraiseLocatorPickerState) !== null && _a !== void 0 ? _a : (globalState.__appraiseLocatorPickerState = {
        picking: false,
        submitting: false,
        hoveredElement: null,
        preview: null,
        error: '',
        elements: {},
    });
    function normalizeText(value) {
        return (value !== null && value !== void 0 ? value : '').replace(/\s+/g, ' ').trim();
    }
    function escapeForCss(value) {
        return value.replace(/[^a-zA-Z0-9_-]/g, match => `\\${match}`);
    }
    function escapeForSelectorText(value) {
        return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
    function isLikelyStableIdentifier(value) {
        if (!value) {
            return false;
        }
        const normalized = value.trim();
        if (!normalized || normalized.length > 120) {
            return false;
        }
        return !/\d{4,}/.test(normalized) && !/[A-Fa-f0-9]{8,}/.test(normalized);
    }
    function isFormControl(element) {
        return ['input', 'textarea', 'select'].includes(element.tagName.toLowerCase());
    }
    function getLabelText(element) {
        if (!isFormControl(element)) {
            return '';
        }
        const input = element;
        if (input.labels && input.labels.length > 0) {
            return normalizeText(Array.from(input.labels)
                .map(label => label.textContent || '')
                .join(' '));
        }
        return '';
    }
    function getAccessibleName(element) {
        const ariaLabel = normalizeText(element.getAttribute('aria-label'));
        if (ariaLabel) {
            return ariaLabel;
        }
        const labelledBy = normalizeText(element.getAttribute('aria-labelledby'));
        if (labelledBy) {
            const text = labelledBy
                .split(/\s+/)
                .map(id => { var _a; return ((_a = document.getElementById(id)) === null || _a === void 0 ? void 0 : _a.textContent) || ''; })
                .join(' ');
            const normalized = normalizeText(text);
            if (normalized) {
                return normalized;
            }
        }
        const labelText = getLabelText(element);
        if (labelText) {
            return labelText;
        }
        const alt = normalizeText(element.getAttribute('alt'));
        if (alt) {
            return alt;
        }
        const title = normalizeText(element.getAttribute('title'));
        if (title) {
            return title;
        }
        const placeholder = normalizeText(element.getAttribute('placeholder'));
        if (placeholder) {
            return placeholder;
        }
        return normalizeText(element.textContent).slice(0, 240);
    }
    function getRole(element) {
        const explicitRole = normalizeText(element.getAttribute('role'));
        if (explicitRole) {
            return explicitRole;
        }
        const tagName = element.tagName.toLowerCase();
        if (tagName === 'button') {
            return 'button';
        }
        if (tagName === 'a' && element.hasAttribute('href')) {
            return 'link';
        }
        if (tagName === 'textarea') {
            return 'textbox';
        }
        if (tagName === 'select') {
            return 'combobox';
        }
        if (tagName === 'img') {
            return 'img';
        }
        if (tagName === 'input') {
            const type = (element.getAttribute('type') || 'text').toLowerCase();
            if (['button', 'submit', 'reset'].includes(type)) {
                return 'button';
            }
            if (type === 'checkbox') {
                return 'checkbox';
            }
            if (type === 'radio') {
                return 'radio';
            }
            return 'textbox';
        }
        return '';
    }
    function countRoleNameMatches(role, accessibleName) {
        let count = 0;
        for (const candidate of Array.from(document.querySelectorAll('*'))) {
            if (getRole(candidate) !== role) {
                continue;
            }
            if (getAccessibleName(candidate) !== accessibleName) {
                continue;
            }
            count += 1;
            if (count > 1) {
                break;
            }
        }
        return count;
    }
    function buildCssSelector(element) {
        const tagName = element.tagName.toLowerCase();
        const name = element.getAttribute('name');
        const type = element.getAttribute('type');
        const ariaLabel = element.getAttribute('aria-label');
        const parts = [tagName];
        if (isLikelyStableIdentifier(name)) {
            parts.push(`[name="${escapeForSelectorText(name)}"]`);
        }
        if (isLikelyStableIdentifier(type)) {
            parts.push(`[type="${escapeForSelectorText(type)}"]`);
        }
        if (isLikelyStableIdentifier(ariaLabel)) {
            parts.push(`[aria-label="${escapeForSelectorText(ariaLabel)}"]`);
        }
        if (parts.length === 1) {
            const stableClasses = Array.from(element.classList || []).filter(isLikelyStableIdentifier).slice(0, 2);
            if (stableClasses.length > 0) {
                parts.push(...stableClasses.map(className => `.${escapeForCss(className)}`));
            }
        }
        return parts.length > 1 ? `css=${parts.join('')}` : '';
    }
    function buildXPathSelector(element, text) {
        const tagName = element.tagName.toLowerCase();
        const id = element.getAttribute('id');
        if (id) {
            return `xpath=//*[@id="${id.replace(/"/g, '\\"')}"]`;
        }
        if (text) {
            return `xpath=//${tagName}[normalize-space()="${text.replace(/"/g, '\\"')}"]`;
        }
        return `xpath=//${tagName}`;
    }
    function buildPrimarySelector(element) {
        for (const attributeName of ['data-testid', 'data-test', 'data-qa']) {
            const value = element.getAttribute(attributeName);
            if (isLikelyStableIdentifier(value)) {
                return {
                    selector: `css=[${attributeName}="${escapeForSelectorText(value)}"]`,
                    strategy: 'test-id',
                };
            }
        }
        const accessibleName = getAccessibleName(element);
        const role = getRole(element);
        if (role && accessibleName && countRoleNameMatches(role, accessibleName) === 1) {
            return {
                selector: `role=${role}[name="${escapeForSelectorText(accessibleName)}"]`,
                strategy: 'role',
            };
        }
        const labelText = getLabelText(element);
        if (labelText) {
            return {
                selector: `label="${escapeForSelectorText(labelText)}"`,
                strategy: 'label',
            };
        }
        const placeholder = normalizeText(element.getAttribute('placeholder'));
        if (placeholder) {
            return {
                selector: `placeholder="${escapeForSelectorText(placeholder)}"`,
                strategy: 'placeholder',
            };
        }
        const id = element.getAttribute('id');
        if (isLikelyStableIdentifier(id)) {
            return {
                selector: `css=#${escapeForCss(id)}`,
                strategy: 'id',
            };
        }
        const cssSelector = buildCssSelector(element);
        if (cssSelector) {
            return {
                selector: cssSelector,
                strategy: 'css',
            };
        }
        return {
            selector: buildXPathSelector(element, normalizeText(element.textContent).slice(0, 120)),
            strategy: 'xpath',
        };
    }
    function buildPreviewPayload(element) {
        const selection = buildPrimarySelector(element);
        return {
            selector: selection.selector,
            strategy: selection.strategy,
            currentUrl: window.location.href,
            pathname: normalizeRoute(window.location.href),
            pageTitle: document.title || '',
            tagName: element.tagName.toLowerCase(),
            text: normalizeText(element.textContent).slice(0, 240) || undefined,
            accessibleName: getAccessibleName(element) || undefined,
        };
    }
    function clearHover() {
        if (state.hoveredElement instanceof Element) {
            state.hoveredElement.classList.remove(HOVER_CLASS);
        }
        state.hoveredElement = null;
    }
    function setPicking(enabled) {
        state.picking = enabled;
        document.documentElement.classList.toggle(ACTIVE_CLASS, enabled);
        if (!enabled) {
            clearHover();
        }
        render();
    }
    function resolveElement(target) {
        if (target instanceof Element) {
            return target;
        }
        if (target instanceof Node) {
            return target.parentElement;
        }
        return null;
    }
    function getMountTarget() {
        var _a, _b;
        return (_b = (_a = document.body) !== null && _a !== void 0 ? _a : document.documentElement) !== null && _b !== void 0 ? _b : null;
    }
    function ensureStyle() {
        if (!document.documentElement) {
            return;
        }
        if (document.getElementById(STYLE_ID)) {
            return;
        }
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
      .${HOVER_CLASS} {
        outline: 2px solid #0f766e !important;
        outline-offset: 2px !important;
        background-color: rgba(15, 118, 110, 0.12) !important;
        cursor: crosshair !important;
      }

      html.${ACTIVE_CLASS},
      html.${ACTIVE_CLASS} * {
        cursor: crosshair !important;
      }

      #${ROOT_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        width: min(360px, calc(100vw - 32px));
        padding: 16px;
        border-radius: 18px;
        border: 1px solid rgba(15, 23, 42, 0.14);
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
        backdrop-filter: blur(12px);
        color: #0f172a;
        font-family: "Segoe UI", "Helvetica Neue", sans-serif;
      }

      #${ROOT_ID} * {
        box-sizing: border-box;
        font-family: inherit;
      }

      #${ROOT_ID} .appraise-picker-heading {
        margin: 0 0 6px;
        font-size: 15px;
        font-weight: 700;
      }

      #${ROOT_ID} .appraise-picker-copy {
        margin: 0;
        color: #475569;
        font-size: 12px;
        line-height: 1.45;
      }

      #${ROOT_ID} .appraise-picker-status {
        margin: 10px 0 0;
        color: #0f766e;
        font-size: 12px;
        font-weight: 600;
      }

      #${ROOT_ID} .appraise-picker-card {
        margin-top: 14px;
        padding: 12px;
        border-radius: 14px;
        background: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.25);
      }

      #${ROOT_ID} .appraise-picker-label {
        display: block;
        margin-bottom: 6px;
        color: #334155;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      #${ROOT_ID} .appraise-picker-value {
        margin: 0;
        color: #0f172a;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }

      #${ROOT_ID} .appraise-picker-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }

      #${ROOT_ID} button {
        border: none;
        border-radius: 999px;
        padding: 10px 14px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      #${ROOT_ID} button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      #${ROOT_ID} .appraise-picker-primary {
        background: #0f766e;
        color: #ffffff;
      }

      #${ROOT_ID} .appraise-picker-secondary {
        background: #e2e8f0;
        color: #0f172a;
      }

      #${ROOT_ID} .appraise-picker-error {
        margin: 10px 0 0;
        color: #b91c1c;
        font-size: 12px;
        line-height: 1.4;
      }
    `;
        document.documentElement.appendChild(style);
    }
    function ensureRoot() {
        var _a;
        const mountTarget = getMountTarget();
        if (!mountTarget) {
            return;
        }
        if ((_a = state.elements.root) === null || _a === void 0 ? void 0 : _a.isConnected) {
            return;
        }
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'Appraise locator picker');
        const heading = document.createElement('p');
        heading.className = 'appraise-picker-heading';
        heading.textContent = 'Appraise Locator Picker';
        const helperText = document.createElement('p');
        helperText.className = 'appraise-picker-copy';
        const statusText = document.createElement('p');
        statusText.className = 'appraise-picker-status';
        const previewCard = document.createElement('div');
        previewCard.className = 'appraise-picker-card';
        const selectorLabel = document.createElement('span');
        selectorLabel.className = 'appraise-picker-label';
        selectorLabel.textContent = 'Selector';
        const selectorValue = document.createElement('pre');
        selectorValue.className = 'appraise-picker-value';
        const metadataLabel = document.createElement('span');
        metadataLabel.className = 'appraise-picker-label';
        metadataLabel.textContent = 'Page';
        const metadataValue = document.createElement('p');
        metadataValue.className = 'appraise-picker-value';
        previewCard.appendChild(selectorLabel);
        previewCard.appendChild(selectorValue);
        previewCard.appendChild(metadataLabel);
        previewCard.appendChild(metadataValue);
        const errorValue = document.createElement('p');
        errorValue.className = 'appraise-picker-error';
        const actions = document.createElement('div');
        actions.className = 'appraise-picker-actions';
        const startButton = document.createElement('button');
        startButton.className = 'appraise-picker-primary';
        startButton.type = 'button';
        startButton.textContent = 'Start picking';
        startButton.addEventListener('click', () => {
            state.preview = null;
            state.error = '';
            setPicking(true);
        });
        const useButton = document.createElement('button');
        useButton.className = 'appraise-picker-primary';
        useButton.type = 'button';
        useButton.textContent = 'Use selector';
        useButton.addEventListener('click', () => {
            if (!state.preview || state.submitting || !globalState.__appraiseLocatorPickerConfirm) {
                return;
            }
            state.submitting = true;
            state.error = '';
            render();
            void globalState
                .__appraiseLocatorPickerConfirm(state.preview)
                .catch(error => {
                state.error = error instanceof Error ? error.message : 'Unable to use selector.';
            })
                .finally(() => {
                state.submitting = false;
                render();
            });
        });
        const pickAgainButton = document.createElement('button');
        pickAgainButton.className = 'appraise-picker-secondary';
        pickAgainButton.type = 'button';
        pickAgainButton.textContent = 'Pick again';
        pickAgainButton.addEventListener('click', () => {
            state.preview = null;
            state.error = '';
            setPicking(true);
        });
        const cancelButton = document.createElement('button');
        cancelButton.className = 'appraise-picker-secondary';
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => {
            if (state.submitting || !globalState.__appraiseLocatorPickerCancel) {
                return;
            }
            state.submitting = true;
            render();
            void globalState.__appraiseLocatorPickerCancel().catch(() => undefined);
        });
        actions.append(startButton, useButton, pickAgainButton, cancelButton);
        root.append(heading, helperText, statusText, previewCard, errorValue, actions);
        mountTarget.appendChild(root);
        state.elements = {
            root,
            startButton,
            useButton,
            pickAgainButton,
            cancelButton,
            helperText,
            statusText,
            selectorValue,
            metadataValue,
            errorValue,
        };
    }
    function render() {
        var _a, _b;
        ensureStyle();
        ensureRoot();
        const { helperText, statusText, selectorValue, metadataValue, errorValue, startButton, useButton, pickAgainButton, cancelButton } = state.elements;
        if (!helperText || !statusText || !selectorValue || !metadataValue || !errorValue || !startButton || !useButton || !pickAgainButton || !cancelButton) {
            return;
        }
        helperText.textContent = state.preview
            ? 'Review the generated selector, then confirm it or pick a different element.'
            : 'Start picking, hover to highlight, then click one element to preview a single generated selector.';
        if (state.picking) {
            statusText.textContent = 'Picking mode is on';
        }
        else if (state.preview) {
            statusText.textContent = 'Selection ready';
        }
        else {
            statusText.textContent = 'Waiting to start';
        }
        selectorValue.textContent = (_b = (_a = state.preview) === null || _a === void 0 ? void 0 : _a.selector) !== null && _b !== void 0 ? _b : 'No selector picked yet.';
        metadataValue.textContent = state.preview
            ? [state.preview.pageTitle || '(untitled page)', state.preview.currentUrl].filter(Boolean).join('\n')
            : 'The selected page metadata will appear here.';
        errorValue.textContent = state.error;
        startButton.style.display = state.preview ? 'none' : 'inline-flex';
        useButton.style.display = state.preview ? 'inline-flex' : 'none';
        pickAgainButton.style.display = state.preview ? 'inline-flex' : 'none';
        useButton.disabled = !state.preview || state.submitting;
        pickAgainButton.disabled = state.submitting;
        cancelButton.disabled = state.submitting;
    }
    function installOrRender() {
        render();
    }
    if (!globalState.__appraiseLocatorPickerDomListenersBound) {
        globalState.__appraiseLocatorPickerDomListenersBound = true;
        document.addEventListener('DOMContentLoaded', installOrRender);
        window.addEventListener('load', installOrRender);
    }
    if (globalState.__appraiseLocatorPickerInstalled) {
        installOrRender();
        return;
    }
    globalState.__appraiseLocatorPickerInstalled = true;
    document.addEventListener('mouseover', event => {
        if (!state.picking) {
            return;
        }
        const target = resolveElement(event.target);
        if (!target || target.closest(`#${ROOT_ID}`)) {
            return;
        }
        clearHover();
        target.classList.add(HOVER_CLASS);
        state.hoveredElement = target;
    }, true);
    document.addEventListener('mouseout', event => {
        if (!state.picking) {
            return;
        }
        const target = resolveElement(event.target);
        if (target instanceof Element) {
            target.classList.remove(HOVER_CLASS);
        }
    }, true);
    document.addEventListener('click', event => {
        if (!state.picking) {
            return;
        }
        const target = resolveElement(event.target);
        if (!target || target.closest(`#${ROOT_ID}`)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void Promise.resolve()
            .then(() => {
            const preview = buildPreviewPayload(target);
            state.preview = preview;
            state.error = '';
            setPicking(false);
        })
            .catch(error => {
            state.error = error instanceof Error ? error.message : 'Unable to inspect that element.';
            setPicking(false);
        });
    }, true);
    installOrRender();
}
