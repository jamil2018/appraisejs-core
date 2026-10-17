const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

export function assertProcessGroupSupport(platform = process.platform) {
  if (platform === 'win32') throw new Error('Native pilot requires POSIX process groups for bounded child cleanup.')
}

function validProcessGroupId(pid) {
  return Number.isInteger(pid) && pid > 0
}

export function signalProcessGroup(pid, signal) {
  if (!validProcessGroupId(pid)) return
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}

export function processGroupExists(pid) {
  if (!validProcessGroupId(pid)) return false
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

async function waitForGroupExit(pid, attempts) {
  for (let index = 0; index < attempts; index += 1) {
    if (!processGroupExists(pid)) return true
    await delay(100)
  }
  return !processGroupExists(pid)
}

export async function stopProcessGroup(pid) {
  if (!processGroupExists(pid)) return true
  signalProcessGroup(pid, 'SIGTERM')
  if (await waitForGroupExit(pid, 30)) return true
  signalProcessGroup(pid, 'SIGKILL')
  return waitForGroupExit(pid, 20)
}

export function createPilotCancellation() {
  const groups = new Set()
  const listeners = new Set()
  let signal = null
  let killTimer = null
  const handlers = new Map()
  for (const name of ['SIGINT', 'SIGTERM']) {
    const handler = () => {
      if (signal) return
      signal = name
      signalAllGroups(groups, 'SIGTERM')
      notifyCancellation(listeners, name)
      killTimer = setTimeout(() => signalAllGroups(groups, 'SIGKILL'), 5000)
    }
    handlers.set(name, handler)
    process.on(name, handler)
  }
  return {
    get signal() {
      return signal
    },
    add(pid) {
      groups.add(pid)
      if (signal) signalProcessGroup(pid, 'SIGTERM')
    },
    delete(pid) {
      groups.delete(pid)
    },
    subscribe(listener) {
      listeners.add(listener)
      if (signal) listener(signal)
      return () => listeners.delete(listener)
    },
    dispose() {
      clearTimeout(killTimer)
      for (const [name, handler] of handlers) process.off(name, handler)
    },
  }
}

function signalAllGroups(groups, signal) {
  for (const pid of groups) signalProcessGroup(pid, signal)
}

function notifyCancellation(listeners, signal) {
  for (const listener of listeners) listener(signal)
}
