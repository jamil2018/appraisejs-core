const main = document.querySelector('#content')
const sidebar = document.querySelector('#sidebar')
const toggleNav = document.querySelector('#toggle-nav')
const projectPicker = document.querySelector('#project')
const recent = document.querySelector('#recent')
const announcement = document.querySelector('#announcement')
const dialog = document.querySelector('#dialog')
const narrow = matchMedia('(max-width: 700px)')

const checkoutPrompt = 'Check that a guest can buy one item.'
const revisionPrompt = 'Also check that I get an order number.'
const checkoutName = 'Guest checkout with a single item'
const storeCases = [
  { name: checkoutName, suite: 'Checkout', steps: 13 },
  {
    name: 'Guest checkout with a delivery address longer than the address field can display on a narrow screen',
    suite: 'Checkout',
    steps: 9,
  },
  { name: 'Cart total updates after changing quantity', suite: 'Checkout', steps: 6 },
  { name: 'A discount code applies to eligible items', suite: 'Promotions', steps: 8 },
  { name: 'An expired discount shows the expiry message', suite: 'Promotions', steps: 5 },
  { name: 'Loyalty members can see order history', suite: 'Accounts', steps: 7 },
  { name: 'A returning customer can reset their password', suite: 'Accounts', steps: 8 },
  { name: 'An unavailable item cannot be added to the cart', suite: 'Checkout', steps: 5 },
]
const casesByProject = { store: storeCases, empty: [] }

const state = {
  page: 'home',
  project: 'store',
  showAttention: true,
  search: '',
  suite: '',
  editorIndex: 0,
  brief: checkoutPrompt,
  criterionEdited: false,
  revision: 1,
  approved: false,
  paused: false,
  nextInstruction: '',
  runOutcome: 'failed',
  evidenceOpen: false,
  context: '',
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
  })
}

function projectName() {
  return projectPicker.selectedOptions[0].textContent
}

function projectCases() {
  return casesByProject[state.project]
}

function label(status, text) {
  return `<span class="status ${status}">${text}</span>`
}

function composer(placeholder, buttonText, suggestion) {
  return `<form class="composer" id="composer">
    <label class="sr-only" for="prompt">${escapeHtml(placeholder)}</label>
    <textarea id="prompt" rows="2" maxlength="3000" required placeholder="${escapeHtml(placeholder)}"></textarea>
    <div class="composer-footer">
      <button type="button" class="quiet" data-action="suggest" data-suggestion="${escapeHtml(suggestion)}">Try an example</button>
      <button class="primary" type="submit">${buttonText}</button>
    </div>
  </form>`
}

function home() {
  const attention =
    state.showAttention && state.project === 'store'
      ? `<section class="attention stack tight" aria-labelledby="attention-title">
        <h2 id="attention-title">Needs attention</h2>
        <ul class="resource-list">
          <li><button class="quiet" data-go="journey">Guest checkout ${state.approved ? label('passed', 'Reviewed') : label('pending', 'Review proposed checks')}</button></li>
          <li><button class="quiet" data-action="interrupted">Discount rules ${label('interrupted', 'Run interrupted')}</button></li>
        </ul>
      </section>`
      : ''
  const context = state.context ? `<p class="message">Discussing ${escapeHtml(state.context)}</p>` : ''

  return `<div class="page reading home stack">
    <div>
      <span class="eyebrow">${escapeHtml(projectName())} / Chat</span>
      <h1>What would you like to check?</h1>
    </div>
    ${context}
    ${composer('Describe what you want to check', 'Send', checkoutPrompt)}
    ${attention}
  </div>`
}

function library() {
  return `<div class="page">
    <header class="page-header"><h1>Test cases</h1><button class="primary" data-action="new-case">New test case</button></header>
    <div class="row toolbar">
      <label for="search" class="sr-only">Search test cases</label>
      <input type="search" id="search" value="${escapeHtml(state.search)}" placeholder="Search test cases" />
      <label for="suite" class="sr-only">Filter by suite</label>
      <select id="suite">
        ${['', 'Checkout', 'Promotions', 'Accounts'].map(suite => `<option value="${suite}" ${suite === state.suite ? 'selected' : ''}>${suite || 'All suites'}</option>`).join('')}
      </select>
    </div>
    <p id="case-count" class="result-count" role="status"></p>
    <div id="case-results"></div>
  </div>`
}

function renderCaseResults() {
  const results = main.querySelector('#case-results')
  if (!results) return

  const count = main.querySelector('#case-count')
  const cases = projectCases()
  if (cases.length === 0) {
    count.hidden = true
    results.innerHTML = '<p class="notice muted">No test cases yet.</p>'
    return
  }

  const matches = cases
    .map((entry, index) => ({ ...entry, index }))
    .filter(entry => entry.name.toLowerCase().includes(state.search.trim().toLowerCase()))
    .filter(entry => !state.suite || entry.suite === state.suite)

  count.textContent = `${matches.length} of ${cases.length} cases${state.suite ? ` · ${state.suite}` : ''}`
  results.innerHTML =
    matches.length === 0
      ? '<p class="notice muted">No cases match your search.</p>'
      : `<div class="table-scroll">
            <table>
              <thead><tr><th scope="col">Name</th><th scope="col">Suite</th><th scope="col">Steps</th></tr></thead>
              <tbody>${matches
                .map(
                  entry => `<tr>
                <td><button class="quiet case-link" data-action="open-case" data-index="${entry.index}">${escapeHtml(entry.name)}</button></td>
                <td>${escapeHtml(entry.suite)}</td><td>${entry.steps}</td>
              </tr>`,
                )
                .join('')}</tbody>
            </table>
          </div>`
}

function editor() {
  const entry = projectCases()[state.editorIndex]
  const creating = !entry
  return `<div class="page reading">
    <button class="quiet breadcrumb" data-go="library">← Test cases</button>
    <header class="page-header">
      <div><h1>${creating ? 'New test case' : escapeHtml(entry.name)}</h1>
      <small id="save-state">${creating ? 'Unsaved' : 'All changes saved'}</small></div>
      <div class="actions">
        ${creating ? '' : '<button type="button" data-action="discuss-case">Discuss this</button>'}
        <button class="primary" form="editor-form" type="submit">${creating ? 'Create test case' : 'Save changes'}</button>
      </div>
    </header>
    <form class="edit-form stack" id="editor-form">
      <label>Name<input id="case-name" value="${escapeHtml(entry?.name ?? '')}" required maxlength="200" /></label>
      <label>Suite<select id="case-suite">
        ${['Checkout', 'Promotions', 'Accounts'].map(suite => `<option ${suite === entry?.suite ? 'selected' : ''}>${suite}</option>`).join('')}
      </select></label>
      ${
        creating
          ? ''
          : `<section class="stack tight">
        <h2>Steps <small>· ${entry.steps}</small></h2>
        ${
          entry.steps === 13
            ? `<ol class="step-list">
          <li>Add one in-stock item to the cart</li>
          <li>Continue as a guest</li>
          <li>Submit delivery and payment details</li>
          <li>Check that confirmation shows an order number</li>
        </ol>`
            : '<p class="muted">Open a step in the full workspace to change its configuration.</p>'
        }
      </section>`
      }
      <details class="details">
        <summary>Advanced configuration</summary>
        <p>Execution, tags, and per-step configuration are outside this prototype.</p>
      </details>
    </form>
  </div>`
}

function journey() {
  const approved = state.approved
  const paused = state.paused
  const status = approved
    ? label('passed', 'Checks approved')
    : paused
      ? label('interrupted', 'Paused')
      : label('pending', 'Needs your review')
  const activity = approved
    ? 'You approved these checks for Staging in Chromium.'
    : paused
      ? 'Review is paused. Your proposed checks are ready when you return.'
      : 'Appraise prepared the checkout checks below.'

  return `<div class="page reading stack">
    <header class="page-header">
      <div><span class="eyebrow">${escapeHtml(projectName())} / Chat</span><h1>Guest checkout</h1></div>
      ${status}
    </header>
    <div class="activity">
      <h2>${approved ? 'Ready to run' : 'Review checks'}</h2>
      <p class="muted">${activity}</p>
    </div>
    <section class="stack tight" aria-label="Your messages">
      <p class="message">${escapeHtml(state.brief)}</p>
      ${state.nextInstruction ? `<p class="message">${escapeHtml(state.nextInstruction)}</p>` : ''}
    </section>
    <section class="review stack" aria-labelledby="proposed">
      <div class="row">
        <h2 id="proposed">${approved ? 'Approved checks' : 'Proposed checks'}</h2>
        <small>Revision ${state.revision}</small>
      </div>
      <ul>
        <li>A guest can add one in-stock item to the cart.</li>
        <li>The guest can complete payment and reach confirmation.</li>
        ${state.criterionEdited ? '<li id="order-number-criterion">The confirmation shows an order number. <small class="changed-note">Added</small></li>' : ''}
      </ul>
      <div class="row action-row">
        <small>Staging · Chromium · Guest checkout</small>
        <div class="actions">
          ${
            approved
              ? '<button class="primary" data-action="run-checks">Run sample checks</button>'
              : paused
                ? '<button class="primary" data-action="resume">Resume review</button>'
                : '<button class="quiet" data-action="pause">Pause</button><button class="primary" data-action="approve">Approve these checks</button>'
          }
        </div>
      </div>
    </section>
    <details class="details">
      <summary>Journey history</summary>
      <p>Brief saved. Proposed checks prepared.${state.criterionEdited ? ' Order number check added.' : ''}${approved ? ' Review approved.' : ''}</p>
    </details>
    ${approved || paused ? '' : composer('Ask Appraise to change these checks', 'Send', revisionPrompt)}
  </div>`
}

function result() {
  const outcome = state.runOutcome
  const interrupted = outcome === 'interrupted'
  const failed = outcome === 'failed'
  const title = interrupted ? 'Discount rules' : 'Guest checkout'
  const summary = interrupted
    ? 'The run lost its connection before Appraise could verify the result.'
    : failed
      ? 'The purchase succeeded. The confirmation was missing an order number.'
      : 'The purchase succeeded and reached the confirmation page.'
  const counts = failed
    ? [
        ['Passed', 11],
        ['Failed', 1],
        ['Skipped', 1],
      ]
    : [
        ['Passed', 11],
        ['Failed', 0],
        ['Skipped', 1],
      ]

  return `<div class="page reading stack">
    <header class="page-header">
      <div><span class="eyebrow">${escapeHtml(projectName())} / Test runs</span><h1>${title}</h1></div>
      <button data-action="discuss-result">Discuss this</button>
    </header>
    <section class="${failed ? 'outcome' : 'review'} stack tight" aria-labelledby="outcome">
      ${interrupted ? label('interrupted', 'Interrupted · Outcome unverified') : failed ? label('failed', 'Failed') : label('passed', 'Passed')}
      <h2 id="outcome">${summary}</h2>
      <small>Staging · Chromium</small>
    </section>
    ${
      interrupted
        ? '<p>Appraise will keep this run as interrupted while its outcome is unknown.</p>'
        : `<dl class="step-status">
          ${counts.map(([name, count]) => `<div><dt>${name}</dt><dd>${count}</dd></div>`).join('')}
        </dl>`
    }
    ${
      failed
        ? `<details class="details" id="evidence" ${state.evidenceOpen ? 'open' : ''}>
      <summary>Order number check</summary>
      <div class="stack tight">
        <p>After payment, the confirmation page loaded. The assertion for the order number found zero matching elements.</p>
        <p><small>Step 12 of 13 · Order confirmation</small></p>
        <p>Expected an order number. Observed <code>0 matching elements</code>.</p>
      </div>
    </details>`
        : ''
    }
    <details class="details">
      <summary>Run history and logs</summary>
      <div class="stack tight">
        <p>${interrupted ? 'The runner disconnected before Appraise received a final result.' : 'Sample execution completed in 24 seconds.'}</p>
        <code>${interrupted ? 'sample-discount-run' : 'sample-checkout-run'}</code>
      </div>
    </details>
    ${failed ? composer('Ask about this result', 'Send', 'Show me where') : ''}
  </div>`
}

function settings() {
  const theme = document.documentElement.dataset.theme
  return `<div class="page reading stack">
    <header class="page-header"><h1>Settings</h1></header>
    <section aria-labelledby="providers">
      <h2 id="providers">Chat providers</h2>
      <div class="row settings-row"><div><strong>ChatGPT</strong><p class="muted">Disconnected</p></div><button data-action="connect" data-provider="ChatGPT">Connect ChatGPT</button></div>
      <div class="row settings-row"><div><strong>Claude Code</strong><p class="muted">Disconnected</p></div><button data-action="connect" data-provider="Claude Code">Connect Claude</button></div>
    </section>
    <section aria-labelledby="appearance">
      <h2 id="appearance">Appearance</h2>
      <div class="row settings-row"><label for="theme">Theme</label>
        <select id="theme">
          <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option>
          <option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option>
        </select>
      </div>
    </section>
  </div>`
}

const screens = { home, library, editor, journey, result, settings }

function render() {
  main.innerHTML = screens[state.page]()
  recent.hidden = state.project === 'empty'
  const dot = document.querySelector('#recent-journey-dot')
  dot.classList.toggle('pending', !state.approved && !state.paused)
  document.querySelector('#recent-journey-status').textContent = state.approved
    ? 'Checks approved'
    : state.paused
      ? 'Paused'
      : 'Needs review'
  document.querySelectorAll('#sidebar [data-go]').forEach(button => {
    const page = state.page === 'editor' ? 'library' : state.page
    const active = button.dataset.go === page && (page !== 'result' || button.closest('.workspace'))
    if (active) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  })
  renderCaseResults()
}

function setNav(open) {
  sidebar.hidden = !open
  toggleNav.setAttribute('aria-expanded', String(open))
  toggleNav.setAttribute('aria-label', open ? 'Hide sidebar' : 'Show sidebar')
}

function go(page, context = '') {
  if (page === 'home') state.context = context
  state.page = page
  if (narrow.matches) setNav(false)
  render()
  window.scrollTo(0, 0)
  const heading = main.querySelector('h1')
  heading.setAttribute('tabindex', '-1')
  heading.focus({ preventScroll: true })
}

function announce(message) {
  announcement.textContent = message
}

function openDialog(title, body) {
  dialog.innerHTML = `<div class="stack"><header class="row"><h2 id="dialog-title">${title}</h2>
    <form method="dialog"><button class="quiet">Close</button></form></header>${body}</div>`
  dialog.showModal()
}

function quickJump() {
  if (dialog.open) return
  openDialog(
    'Quick jump',
    `<div>
    <button class="nav-link" data-go="home">Chat home</button>
    <button class="nav-link" data-go="library">Test cases</button>
    <button class="nav-link" data-go="journey">Guest checkout</button>
    <button class="nav-link" data-go="result">Test runs</button>
    <button class="nav-link" data-go="settings">Settings</button>
  </div>`,
  )
}

function updateReview(message, highlightCriterion = false) {
  render()
  if (highlightCriterion) main.querySelector('#order-number-criterion').classList.add('changed')
  const heading = main.querySelector('#proposed')
  heading.setAttribute('tabindex', '-1')
  heading.focus({ preventScroll: true })
  announce(message)
}

function sendPrompt(form) {
  const input = form.querySelector('textarea')
  const prompt = input.value.trim()
  if (!prompt) return
  if (state.page === 'home' && /guest|checkout/i.test(prompt)) {
    Object.assign(state, {
      brief: prompt,
      criterionEdited: false,
      nextInstruction: '',
      revision: 1,
      approved: false,
      paused: false,
    })
    go('journey')
    announce('Checkout checks are ready to review.')
  } else if (state.page === 'journey' && /order (number|id|identifier)/i.test(prompt)) {
    const added = !state.criterionEdited
    if (added) state.revision += 1
    state.criterionEdited = true
    state.nextInstruction = prompt
    updateReview(added ? 'Added the order number check.' : 'The order number check is already included.', added)
  } else if (state.page === 'result' && /show|where|why|evidence|step|order/i.test(prompt)) {
    state.evidenceOpen = true
    const detail = main.querySelector('#evidence')
    detail.open = true
    detail.querySelector('summary').focus()
    form.reset()
  } else {
    announce('Try the sample prompt in this prototype.')
    input.setCustomValidity('Try the sample prompt in this prototype.')
    input.reportValidity()
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button')
  if (!button) return
  if (button.dataset.go) {
    if (dialog.open) dialog.close()
    if (button.dataset.go === 'result') {
      state.runOutcome = 'failed'
      state.evidenceOpen = false
    }
    go(button.dataset.go)
    return
  }
  switch (button.dataset.action) {
    case 'new-chat':
      state.showAttention = false
      go('home')
      main.querySelector('#prompt').focus()
      break
    case 'suggest': {
      const prompt = main.querySelector('#prompt')
      prompt.value = button.dataset.suggestion
      prompt.setCustomValidity('')
      prompt.focus()
      break
    }
    case 'new-case':
      state.editorIndex = projectCases().length
      go('editor')
      break
    case 'open-case':
      state.editorIndex = Number(button.dataset.index)
      go('editor')
      break
    case 'pause':
      state.paused = true
      updateReview('Journey paused.')
      break
    case 'resume':
      state.paused = false
      updateReview('Review resumed.')
      break
    case 'approve':
      state.approved = true
      updateReview(`Revision ${state.revision} approved.`)
      break
    case 'run-checks':
      state.runOutcome = state.criterionEdited ? 'failed' : 'passed'
      state.evidenceOpen = false
      go('result')
      break
    case 'interrupted':
      state.runOutcome = 'interrupted'
      go('result')
      break
    case 'discuss-case':
    case 'discuss-result': {
      const context =
        button.dataset.action === 'discuss-case'
          ? projectCases()[state.editorIndex].name
          : state.runOutcome === 'interrupted'
            ? 'Discount rules run'
            : 'Guest checkout run'
      go('home', context)
      main.querySelector('#prompt').focus()
      break
    }
    case 'connect':
      openDialog(
        `Connect ${escapeHtml(button.dataset.provider)}`,
        '<p>In the full app, this opens provider-owned sign-in. This prototype uses sample data.</p>',
      )
      break
  }
})

document.addEventListener('submit', event => {
  if (event.target.id === 'composer') {
    event.preventDefault()
    sendPrompt(event.target)
  }
  if (event.target.id === 'editor-form') {
    event.preventDefault()
    const name = main.querySelector('#case-name').value.trim()
    if (!name) return
    const suite = main.querySelector('#case-suite').value
    const cases = projectCases()
    const entry = cases[state.editorIndex]
    cases[state.editorIndex] = { name, suite, steps: entry?.steps ?? 0 }
    go('editor')
    announce('Test case saved in the prototype.')
  }
})

document.addEventListener('input', event => {
  const { id, value } = event.target
  if (id === 'search') {
    state.search = value
    renderCaseResults()
  }
  if (id === 'prompt') event.target.setCustomValidity('')
  if (id === 'case-name' || id === 'case-suite') main.querySelector('#save-state').textContent = 'Unsaved changes'
})

document.addEventListener('change', event => {
  const { id, value } = event.target
  if (id === 'project') {
    Object.assign(state, { project: value, search: '', suite: '', showAttention: true })
    go('home')
  }
  if (id === 'suite') {
    state.suite = value
    renderCaseResults()
  }
  if (id === 'theme') document.documentElement.dataset.theme = value
})

toggleNav.addEventListener('click', () => setNav(sidebar.hidden))
document.querySelector('#open-command').addEventListener('click', quickJump)
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    quickJump()
  }
})

setNav(!narrow.matches)
render()
