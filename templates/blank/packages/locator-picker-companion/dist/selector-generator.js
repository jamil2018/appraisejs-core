function normalizeText(value) {
  return (value !== null && value !== void 0 ? value : '').replace(/\s+/g, ' ').trim()
}
function normalizeRoute(value) {
  if (!value) {
    return '/'
  }
  try {
    return new URL(value).pathname || '/'
  } catch (_a) {
    return value.startsWith('/') ? value : `/${value}`
  }
}
function escapeForCss(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, match => `\\${match}`)
}
function escapeForSelectorText(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
function isLikelyStableIdentifier(value) {
  if (!value) {
    return false
  }
  const normalized = value.trim()
  if (!normalized || normalized.length > 120) {
    return false
  }
  return !/\d{4,}/.test(normalized) && !/[A-Fa-f0-9]{8,}/.test(normalized)
}
function buildCssSelector(snapshot) {
  const parts = [snapshot.tagName]
  if (isLikelyStableIdentifier(snapshot.nameAttribute)) {
    parts.push(`[name="${escapeForSelectorText(snapshot.nameAttribute)}"]`)
  }
  if (isLikelyStableIdentifier(snapshot.typeAttribute)) {
    parts.push(`[type="${escapeForSelectorText(snapshot.typeAttribute)}"]`)
  }
  if (isLikelyStableIdentifier(snapshot.ariaLabel)) {
    parts.push(`[aria-label="${escapeForSelectorText(snapshot.ariaLabel)}"]`)
  }
  if (parts.length === 1 && snapshot.stableClasses.length > 0) {
    parts.push(...snapshot.stableClasses.slice(0, 2).map(className => `.${escapeForCss(className)}`))
  }
  return parts.length > 1 ? `css=${parts.join('')}` : ''
}
function buildXPathSelector(snapshot) {
  if (snapshot.id) {
    return `xpath=//*[@id="${snapshot.id.replace(/"/g, '\\"')}"]`
  }
  if (snapshot.text) {
    return `xpath=//${snapshot.tagName}[normalize-space()="${snapshot.text.replace(/"/g, '\\"')}"]`
  }
  return `xpath=//${snapshot.tagName}`
}
function buildPrimarySelector(snapshot) {
  if (isLikelyStableIdentifier(snapshot.testAttributeValue)) {
    return {
      selector: `css=[${snapshot.testAttributeName}="${escapeForSelectorText(snapshot.testAttributeValue)}"]`,
      strategy: 'test-id',
    }
  }
  if (snapshot.role && snapshot.accessibleName && snapshot.roleNameMatchCount === 1) {
    return {
      selector: `role=${snapshot.role}[name="${escapeForSelectorText(snapshot.accessibleName)}"]`,
      strategy: 'role',
    }
  }
  if (snapshot.labelText) {
    return {
      selector: `label="${escapeForSelectorText(snapshot.labelText)}"`,
      strategy: 'label',
    }
  }
  if (snapshot.placeholder) {
    return {
      selector: `placeholder="${escapeForSelectorText(snapshot.placeholder)}"`,
      strategy: 'placeholder',
    }
  }
  if (isLikelyStableIdentifier(snapshot.id)) {
    return {
      selector: `css=#${escapeForCss(snapshot.id)}`,
      strategy: 'id',
    }
  }
  const cssSelector = buildCssSelector(snapshot)
  if (cssSelector) {
    return {
      selector: cssSelector,
      strategy: 'css',
    }
  }
  return {
    selector: buildXPathSelector(snapshot),
    strategy: 'xpath',
  }
}
async function getElementSnapshot(elementHandle) {
  return elementHandle.evaluate(node => {
    const element = node
    const normalizeText = value => (value !== null && value !== void 0 ? value : '').replace(/\s+/g, ' ').trim()
    const isLikelyStableIdentifier = value => {
      if (!value) {
        return false
      }
      const normalized = value.trim()
      if (!normalized || normalized.length > 120) {
        return false
      }
      return !/\d{4,}/.test(normalized) && !/[A-Fa-f0-9]{8,}/.test(normalized)
    }
    const getLabelText = candidate => {
      if (!['input', 'textarea', 'select'].includes(candidate.tagName.toLowerCase())) {
        return ''
      }
      const input = candidate
      if (input.labels && input.labels.length > 0) {
        return normalizeText(
          Array.from(input.labels)
            .map(label => label.textContent || '')
            .join(' '),
        )
      }
      return ''
    }
    const getAccessibleName = candidate => {
      const ariaLabel = normalizeText(candidate.getAttribute('aria-label'))
      if (ariaLabel) {
        return ariaLabel
      }
      const labelledBy = normalizeText(candidate.getAttribute('aria-labelledby'))
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map(id => {
            var _a
            return ((_a = document.getElementById(id)) === null || _a === void 0 ? void 0 : _a.textContent) || ''
          })
          .join(' ')
        const normalized = normalizeText(text)
        if (normalized) {
          return normalized
        }
      }
      const labelText = getLabelText(candidate)
      if (labelText) {
        return labelText
      }
      const alt = normalizeText(candidate.getAttribute('alt'))
      if (alt) {
        return alt
      }
      const title = normalizeText(candidate.getAttribute('title'))
      if (title) {
        return title
      }
      const placeholder = normalizeText(candidate.getAttribute('placeholder'))
      if (placeholder) {
        return placeholder
      }
      return normalizeText(candidate.textContent).slice(0, 240)
    }
    const getRole = candidate => {
      const explicitRole = normalizeText(candidate.getAttribute('role'))
      if (explicitRole) {
        return explicitRole
      }
      const tagName = candidate.tagName.toLowerCase()
      if (tagName === 'button') {
        return 'button'
      }
      if (tagName === 'a' && candidate.hasAttribute('href')) {
        return 'link'
      }
      if (tagName === 'textarea') {
        return 'textbox'
      }
      if (tagName === 'select') {
        return 'combobox'
      }
      if (tagName === 'img') {
        return 'img'
      }
      if (tagName === 'input') {
        const type = (candidate.getAttribute('type') || 'text').toLowerCase()
        if (['button', 'submit', 'reset'].includes(type)) {
          return 'button'
        }
        if (type === 'checkbox') {
          return 'checkbox'
        }
        if (type === 'radio') {
          return 'radio'
        }
        return 'textbox'
      }
      return ''
    }
    const role = getRole(element)
    const accessibleName = getAccessibleName(element)
    let roleNameMatchCount = 0
    if (role && accessibleName) {
      for (const candidate of Array.from(document.querySelectorAll('*'))) {
        if (getRole(candidate) !== role) {
          continue
        }
        if (getAccessibleName(candidate) !== accessibleName) {
          continue
        }
        roleNameMatchCount += 1
        if (roleNameMatchCount > 1) {
          break
        }
      }
    }
    let testAttributeName = ''
    let testAttributeValue = ''
    for (const attributeName of ['data-testid', 'data-test', 'data-qa']) {
      const value = element.getAttribute(attributeName)
      if (isLikelyStableIdentifier(value)) {
        testAttributeName = attributeName
        testAttributeValue = value
        break
      }
    }
    return {
      tagName: element.tagName.toLowerCase(),
      text: normalizeText(element.textContent).slice(0, 240),
      accessibleName,
      labelText: getLabelText(element),
      placeholder: normalizeText(element.getAttribute('placeholder')),
      id: normalizeText(element.getAttribute('id')),
      role,
      roleNameMatchCount,
      stableClasses: Array.from(element.classList || [])
        .filter(className => isLikelyStableIdentifier(className))
        .slice(0, 2),
      nameAttribute: normalizeText(element.getAttribute('name')),
      typeAttribute: normalizeText(element.getAttribute('type')),
      ariaLabel: normalizeText(element.getAttribute('aria-label')),
      testAttributeName,
      testAttributeValue,
    }
  })
}
export async function generatePickedLocatorPayload(page, elementHandle) {
  const snapshot = await getElementSnapshot(elementHandle)
  const selection = buildPrimarySelector(snapshot)
  const currentUrl = page.url()
  const pageTitle = normalizeText(await page.title().catch(() => ''))
  return {
    selector: selection.selector,
    strategy: selection.strategy,
    currentUrl,
    pathname: normalizeRoute(currentUrl),
    pageTitle,
    tagName: snapshot.tagName,
    text: snapshot.text || undefined,
    accessibleName: snapshot.accessibleName || undefined,
  }
}
