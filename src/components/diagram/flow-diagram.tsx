'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'

import type { FlowDiagramProps } from './flow-diagram-types'

type AuthoredNode = NodeOrderMap[string] | TemplateTestCaseNodeOrderMap[string]

function keyOf(definition: StepDefinitionOption) {
  return `${definition.reference.id}@${definition.reference.version}`
}

function renderPresentation(definition: StepDefinitionOption, inputs: Record<string, unknown>) {
  const description = definition.signature.replace(/\{([^}]+)\}/g, (_, name: string) =>
    String(inputs[name] ?? `{${name}}`),
  )
  return `${definition.keywordCompatibility[0] ?? 'When'} ${description}`
}

function initialInputs(definition: StepDefinitionOption): Record<string, unknown> {
  return Object.fromEntries(
    definition.inputs.flatMap(input =>
      input.defaultValue !== undefined ? [[input.name, input.defaultValue]] : input.required ? [[input.name, '']] : [],
    ),
  )
}

export function parseStepInvocationInput(input: StepDefinitionOption['inputs'][number], value: string | boolean) {
  if (input.type === 'boolean') return Boolean(value)
  if (input.type === 'number') {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) throw new Error(`${input.name} must be a finite number.`)
    return parsed
  }
  if (input.type === 'json') {
    if (typeof value !== 'string') throw new Error(`${input.name} must be JSON text.`)
    return JSON.parse(value) as unknown
  }
  return value
}

function nodeFor(definition: StepDefinitionOption, order: number): NodeOrderMap[string] {
  const inputs = initialInputs(definition)
  const invocation = {
    step: definition.reference,
    inputs,
    presentation: {
      keyword: definition.keywordCompatibility[0] ?? 'When',
      description: renderPresentation(definition, inputs).replace(/^(Given|When|Then|And)\s+/, ''),
    },
  } as const
  return {
    nodeId: crypto.randomUUID(),
    order,
    label: definition.title,
    gherkinStep: renderPresentation(definition, inputs),
    icon: 'MOUSE',
    parameters: definition.inputs.map((input, index) => ({
      name: input.name,
      value: String(inputs[input.name] ?? ''),
      type: 'STRING',
      order: index,
    })),
    invocation,
  }
}

export default function FlowDiagram({ nodeOrder, stepDefinitions, onNodeOrderChange }: FlowDiagramProps) {
  const [selectedKey, setSelectedKey] = useState(() => stepDefinitions[0] && keyOf(stepDefinitions[0]))
  const selected = useMemo(
    () => stepDefinitions.find(definition => keyOf(definition) === selectedKey) ?? stepDefinitions[0],
    [selectedKey, stepDefinitions],
  )
  const orderedNodes = useMemo(
    () => Object.entries(nodeOrder).sort(([, left], [, right]) => left.order - right.order),
    [nodeOrder],
  )

  const publish = (nodes: AuthoredNode[]) => {
    const next = Object.fromEntries(
      nodes.map((node, index) => [node.nodeId ?? crypto.randomUUID(), { ...node, order: index + 1 }]),
    )
    onNodeOrderChange(next as FlowDiagramProps['nodeOrder'])
  }

  const add = () => {
    if (!selected) return
    publish([...orderedNodes.map(([, node]) => node), nodeFor(selected, orderedNodes.length + 1)])
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-72 flex-1 space-y-2">
          <Label htmlFor="step-definition">Step Definition</Label>
          <select
            id="step-definition"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={selected ? keyOf(selected) : ''}
            onChange={event => setSelectedKey(event.target.value)}
          >
            {stepDefinitions.map(definition => (
              <option key={keyOf(definition)} value={keyOf(definition)}>
                {definition.title} ({definition.reference.id}@{definition.reference.version})
              </option>
            ))}
          </select>
        </div>
        <Button type="button" disabled={!selected} onClick={add}>
          <Plus className="size-4" /> Add step
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto">
        {orderedNodes.map(([id, node], index) => {
          const definition = stepDefinitions.find(
            item =>
              item.reference.id === node.invocation.step.id &&
              item.reference.version === node.invocation.step.version &&
              item.reference.definitionHash === node.invocation.step.definitionHash,
          )
          return (
            <article key={id} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{node.gherkinStep}</p>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${node.label}`}
                  onClick={() => publish(orderedNodes.filter(([nodeId]) => nodeId !== id).map(([, item]) => item))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {definition?.inputs.map((input: StepDefinitionOption['inputs'][number]) => (
                <label key={input.name} className="block space-y-1 text-sm">
                  <span>{input.name}</span>
                  <Input
                    type={input.type === 'number' ? 'number' : input.type === 'boolean' ? 'checkbox' : 'text'}
                    checked={input.type === 'boolean' ? Boolean(node.invocation.inputs[input.name]) : undefined}
                    value={input.type === 'boolean' ? undefined : String(node.invocation.inputs[input.name] ?? '')}
                    required={input.required}
                    onChange={event => {
                      let parsed: unknown
                      try {
                        parsed = parseStepInvocationInput(
                          input,
                          input.type === 'boolean' ? event.target.checked : event.target.value,
                        )
                      } catch {
                        return
                      }
                      const inputs = { ...node.invocation.inputs, [input.name]: parsed }
                      const nextNode = {
                        ...node,
                        invocation: {
                          ...node.invocation,
                          inputs,
                          presentation: {
                            keyword: definition.keywordCompatibility[0] ?? 'When',
                            description: renderPresentation(definition, inputs).replace(
                              /^(Given|When|Then|And)\s+/,
                              '',
                            ),
                          },
                        },
                        gherkinStep: renderPresentation(definition, inputs),
                        parameters: node.parameters.map((parameter: AuthoredNode['parameters'][number]) =>
                          parameter.name === input.name ? { ...parameter, value: String(parsed) } : parameter,
                        ),
                      }
                      publish(orderedNodes.map(([, item], itemIndex) => (itemIndex === index ? nextNode : item)))
                    }}
                  />
                </label>
              ))}
            </article>
          )
        })}
        {orderedNodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a ready Step Definition.</p>
        ) : null}
      </div>
    </section>
  )
}
