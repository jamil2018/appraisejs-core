import type { ConversationRecord } from '@/lib/conversation/workspace-records'
import { listEnvironments } from '@/services/environment/environment-service'
import { listLocatorGroups } from '@/services/locator-group/locator-group-service'
import { listLocators } from '@/services/locator/locator-service'
import { listTargetProjects } from '@/services/target-project/target-project-service'

type ProjectWorkspaceAnswer = { content: string; records: readonly ConversationRecord[] }

const queryLimit = 10

function matches(value: string, query?: string) {
  return !query || value.toLocaleLowerCase().includes(query.toLocaleLowerCase())
}

function summarize(kind: string, records: ConversationRecord[], query?: string): ProjectWorkspaceAnswer {
  if (records.length === 0)
    return { content: `I could not find a matching ${kind}. Check the project and name.`, records: [] }
  const shown = records.slice(0, queryLimit)
  return {
    content: `${query ? `Found ${records.length} matching` : `Found ${records.length}`} ${kind}${records.length === 1 ? '' : 's'} in the current project.${records.length > queryLimit ? ' Refine the name to narrow the list.' : ''}`,
    records: shown,
  }
}

/** Read-only workspace requests. Every domain read receives the saved conversation's project ID. */
export async function answerProjectWorkspaceRequest(input: {
  targetProjectId: string
  content: string
}): Promise<ProjectWorkspaceAnswer | undefined> {
  const text = input.content.trim().replace(/\s+/g, ' ')
  const normalized = text.toLocaleLowerCase().replace(/[.!?]$/, '')

  if (
    /^(?:open|show) (?:agent |provider )?settings$/.test(normalized) ||
    /^connect (?:chatgpt|claude code|cursor|codex)$/.test(normalized)
  ) {
    return {
      content:
        'Open Settings to complete provider setup in its protected controls. A diagnostic receipt records the last observation, not a current connection.',
      records: [{ kind: 'SETTINGS', id: input.targetProjectId, title: 'Provider settings' }],
    }
  }

  if (/^(?:set up|setup|diagnose) (?:codex|the agent|my project)$/.test(normalized)) {
    return {
      content:
        'Open the project setup and diagnostic details. Complete setup in the agent client, then refresh its observed preflight receipt.',
      records: [{ kind: 'PROJECT', id: input.targetProjectId, title: 'Project setup' }],
    }
  }

  if (/^(?:switch to|select) (.+?) project$/.test(normalized)) {
    const query = normalized.match(/^(?:switch to|select) (.+?) project$/)?.[1]
    const projects = (await listTargetProjects()).filter(project => matches(project.displayName, query))
    if (projects.length === 0)
      return {
        content: 'No project matches that name. Open Projects to inspect registered targets.',
        records: [{ kind: 'PROJECT', id: input.targetProjectId, title: 'Manage projects' }],
      }
    return {
      content: `${projects.length} project${projects.length === 1 ? '' : 's'} match. Open Projects and select the exact target. This saved conversation remains in its original project.`,
      records: projects
        .slice(0, queryLimit)
        .map(project => ({ kind: 'PROJECT', id: project.id, title: project.displayName })),
    }
  }

  if (/^rename (?:this|the) project(?: to .+)?$/.test(normalized)) {
    const project = (await listTargetProjects()).find(item => item.id === input.targetProjectId)
    return {
      content:
        'Open the current project and confirm its new display name in the rename dialog. The project identity stays the same.',
      records: [{ kind: 'PROJECT', id: input.targetProjectId, title: project?.displayName ?? 'Current project' }],
    }
  }

  if (/^(?:add|create) (?:a |an )?.+ environment$/.test(normalized)) {
    return {
      content:
        'Open the environment form for this project. Enter and save the exact base URL there; secrets remain in the protected process or provider controls.',
      records: [{ kind: 'ENVIRONMENT', id: input.targetProjectId, title: 'New environment', destination: 'create' }],
    }
  }
  if (/^(?:capture|pick|inspect) (?:the |a )?.+?(?: locator| button| element)$/.test(normalized)) {
    return {
      content:
        'Open the locator picker for this project. Choose a saved environment or URL, capture one live target, then review and save its selector.',
      records: [{ kind: 'LOCATOR', id: input.targetProjectId, title: 'Capture locator', destination: 'create' }],
    }
  }
  if (/^(?:add|create) (?:a |an )?.+ locator group$/.test(normalized)) {
    return {
      content: 'Open the locator group form, choose the owning module, then review and save the group in this project.',
      records: [
        { kind: 'LOCATOR_GROUP', id: input.targetProjectId, title: 'New locator group', destination: 'create' },
      ],
    }
  }

  const named = normalized.match(/^(?:find|open) (.+?) (environment|locator group|locator)$/)
  if (named) {
    const [, query, kind] = named
    if (kind === 'environment') {
      const environments = (await listEnvironments(input.targetProjectId)).filter(row => matches(row.name, query))
      return summarize(
        'environment',
        environments.map(row => ({ kind: 'ENVIRONMENT', id: row.id, title: row.name })),
        query,
      )
    }
    if (kind === 'locator group') {
      const groups = (await listLocatorGroups(input.targetProjectId)).filter(row => matches(row.name, query))
      return summarize(
        'locator group',
        groups.map(row => ({ kind: 'LOCATOR_GROUP', id: row.id, title: row.name })),
        query,
      )
    }
    const locators = (await listLocators(input.targetProjectId)).filter(row => matches(row.name, query))
    return summarize(
      'locator',
      locators.map(row => ({ kind: 'LOCATOR', id: row.id, title: row.name })),
      query,
    )
  }

  const read = normalized.match(
    /^(?:show|list|find|open) (?:my |the )?(environments?|locators?|locator groups?|projects?)(?: (?:named|matching) (.+))?$/,
  )
  if (!read) return undefined
  const kind = read[1]
  const query = read[2]

  if (kind.startsWith('environment')) {
    const environments = (await listEnvironments(input.targetProjectId)).filter(row => matches(row.name, query))
    return summarize(
      'environment',
      environments.map(row => ({ kind: 'ENVIRONMENT', id: row.id, title: row.name })),
      query,
    )
  }
  if (kind.startsWith('locator group')) {
    const groups = (await listLocatorGroups(input.targetProjectId)).filter(row => matches(row.name, query))
    return summarize(
      'locator group',
      groups.map(row => ({ kind: 'LOCATOR_GROUP', id: row.id, title: row.name })),
      query,
    )
  }
  if (kind.startsWith('locator')) {
    const locators = (await listLocators(input.targetProjectId)).filter(row => matches(row.name, query))
    return summarize(
      'locator',
      locators.map(row => ({ kind: 'LOCATOR', id: row.id, title: row.name })),
      query,
    )
  }
  const projects = (await listTargetProjects()).filter(row => matches(row.displayName, query))
  return {
    content: `${projects.length} registered project${projects.length === 1 ? '' : 's'}. Select a project through its exact control.`,
    records: projects.slice(0, queryLimit).map(row => ({ kind: 'PROJECT', id: row.id, title: row.displayName })),
  }
}
