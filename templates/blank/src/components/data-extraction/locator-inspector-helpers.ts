export type SelectedElementPayload = {
  tagName: string
  id?: string
  className?: string
  name?: string
  textContent?: string
  outerHTML: string
}

export type LocatorInspectorMessage =
  | { type: 'SELECTION_MODE_OFF' }
  | { type: 'ELEMENT_SELECTED'; elementData: SelectedElementPayload }

function isSelectedElementPayload(value: unknown): value is SelectedElementPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tagName' in value &&
    typeof value.tagName === 'string' &&
    'outerHTML' in value &&
    typeof value.outerHTML === 'string'
  )
}

export function isLocatorInspectorMessage(value: unknown): value is LocatorInspectorMessage {
  if (typeof value !== 'object' || value === null || !('type' in value) || typeof value.type !== 'string') {
    return false
  }

  if (value.type === 'SELECTION_MODE_OFF') {
    return true
  }

  if (value.type === 'ELEMENT_SELECTED') {
    return 'elementData' in value && isSelectedElementPayload(value.elementData)
  }

  return false
}

export function generateCSSPath(element: { tagName: string; className?: string; id?: string }) {
  if (element.id) {
    return `#${element.id}`
  }

  let path = element.tagName.toLowerCase()
  if (element.className) {
    const classes = element.className.split(' ').filter(Boolean)
    if (classes.length > 0) {
      path += `.${classes.join('.')}`
    }
  }

  return path
}

export function generateXPath(element: { tagName: string; className?: string; id?: string }) {
  if (element.id) {
    return `//*[@id="${element.id}"]`
  }

  let path = `//${element.tagName.toLowerCase()}`
  if (element.className) {
    path += `[@class="${element.className}"]`
  }

  return path
}

export function getLocatorInspectorOrigin(iframeUrl: string, baseUrl: string) {
  try {
    return new URL(iframeUrl, baseUrl).origin
  } catch {
    return new URL(baseUrl).origin
  }
}

export function createLocatorInspectorInjectionScript(parentOrigin: string) {
  const serializedParentOrigin = JSON.stringify(parentOrigin)

  return `
    (function() {
      if (window.locatorInspectorInjected) return;
      window.locatorInspectorInjected = true;

      const parentOrigin = ${serializedParentOrigin};
      let isSelectionMode = false;
      let hoveredElement = null;

      const style = document.createElement('style');
      style.textContent = \`
        .locator-inspector-hover {
          outline: 2px solid #3b82f6 !important;
          background-color: rgba(59, 130, 246, 0.1) !important;
          cursor: crosshair !important;
        }
        .locator-inspector-selection-mode * {
          cursor: crosshair !important;
        }
      \`;
      document.head.appendChild(style);

      function postMessageToParent(message) {
        window.parent.postMessage(message, parentOrigin);
      }

      function handleElementClick(event) {
        if (!isSelectionMode) return;

        event.preventDefault();
        event.stopPropagation();

        const target = event.target;
        if (!(target instanceof Element)) return;

        postMessageToParent({
          type: 'ELEMENT_SELECTED',
          elementData: {
            tagName: target.tagName,
            id: target.id,
            className: target.className,
            name: 'name' in target ? target.name : undefined,
            textContent: target.textContent?.trim(),
            outerHTML: target.outerHTML,
          }
        });

        exitSelectionMode();
      }

      function handleElementHover(event) {
        if (!isSelectionMode || !(event.target instanceof Element)) return;

        if (hoveredElement instanceof Element) {
          hoveredElement.classList.remove('locator-inspector-hover');
        }

        hoveredElement = event.target;
        hoveredElement.classList.add('locator-inspector-hover');
      }

      function handleElementLeave(event) {
        if (!isSelectionMode || !(event.target instanceof Element)) return;
        event.target.classList.remove('locator-inspector-hover');
      }

      function enterSelectionMode() {
        isSelectionMode = true;
        document.body.classList.add('locator-inspector-selection-mode');
        document.addEventListener('click', handleElementClick, true);
        document.addEventListener('mouseover', handleElementHover, true);
        document.addEventListener('mouseout', handleElementLeave, true);
      }

      function exitSelectionMode() {
        isSelectionMode = false;
        document.body.classList.remove('locator-inspector-selection-mode');
        document.removeEventListener('click', handleElementClick, true);
        document.removeEventListener('mouseover', handleElementHover, true);
        document.removeEventListener('mouseout', handleElementLeave, true);

        document.querySelectorAll('.locator-inspector-hover').forEach(el => {
          el.classList.remove('locator-inspector-hover');
        });

        hoveredElement = null;
        postMessageToParent({ type: 'SELECTION_MODE_OFF' });
      }

      window.addEventListener('message', function(event) {
        if (event.origin !== parentOrigin || !event.data || event.data.type !== 'TOGGLE_SELECTION_MODE') {
          return;
        }

        if (event.data.isSelectionMode) {
          enterSelectionMode();
        } else {
          exitSelectionMode();
        }
      });
    })();
  `
}
