'use client'
import React, { useCallback, useState } from 'react'
import TestCaseFlow from './test-case-flow'
import { NodeOrderMap } from '@/types/diagram/diagram'
import {
  Locator,
  LocatorGroup,
  StepParameterType,
  TemplateStep,
  TemplateStepIcon,
  TemplateStepParameter,
  TestSuite,
  Tag,
} from '@prisma/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MultiSelect } from '@/components/ui/multi-select'
import { Button } from '@/components/ui/button'
import ErrorMessage from '@/components/form/error-message'
import { z } from 'zod'
import { toast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'
import { IconToKeyTransformer } from '@/lib/transformers/key-to-icon-transformer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { langs } from '@uiw/codemirror-extensions-langs'
import { githubDark } from '@uiw/codemirror-theme-github'
import { ActionResponse } from '@/types/form/actionHandler'
import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'

const errorSchema = z.object({
  title: z.string().min(3, { message: 'Title must be at least 3 characters' }),
  description: z.string().optional(),
  testSuiteIds: z.array(z.string()).min(1, { message: 'Test suites are required' }),
  tagIds: z.array(z.string()).optional(),
  steps: z.array(
    z.object({
      gherkinStep: z.string(),
      label: z.string(),
      icon: z.nativeEnum(TemplateStepIcon),
      parameters: z.array(
        z.object({
          name: z.string(),
          value: z.string(),
          type: z.nativeEnum(StepParameterType),
          order: z.number(),
        }),
      ),
      order: z.number(),
      templateStepId: z.string(),
    }),
  ),
})

const TestCaseForm = ({
  defaultNodesOrder,
  templateStepParams,
  templateSteps,
  locators,
  locatorGroups,
  testSuites,
  tags,
  id,
  defaultTitle,
  defaultDescription,
  defaultTestSuiteIds,
  defaultTagIds,
  onSubmitAction,
}: {
  defaultNodesOrder: NodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Locator[]
  locatorGroups: LocatorGroup[]
  testSuites: TestSuite[]
  tags: Tag[]
  onSubmitAction: (value: z.infer<typeof testCaseSchema>, id?: string) => Promise<ActionResponse>
  id?: string
  defaultTitle?: string
  defaultDescription?: string
  defaultTestSuiteIds?: string[]
  defaultTagIds?: string[]
}) => {
  const router = useRouter()
  // states
  const [nodesOrder, setNodesOrder] = useState<NodeOrderMap>(defaultNodesOrder)
  const [title, setTitle] = useState<string>(defaultTitle || '')
  const [description, setDescription] = useState<string>(defaultDescription || '')
  const [selectedTestSuites, setSelectedTestSuites] = useState<string[]>(defaultTestSuiteIds || [])
  const [selectedTags, setSelectedTags] = useState<string[]>(defaultTagIds || [])
  console.log(`defaultTestSuiteIds`, defaultTestSuiteIds)
  const [errors, setErrors] = useState<{
    title?: string[]
    description?: string[]
    testSuiteIds?: string[]
  }>({})

  const generateGherkinSyntax = useCallback(() => {
    if (!title) return ''

    const scenarioHeader = `Scenario: [${title}] ${description || ''}`

    // Filter out nodes with order -1 and sort the remaining nodes
    const validSteps = Object.entries(nodesOrder)
      .map(([, value]) => value)
      .filter(step => step.order !== -1)
      .sort((a, b) => a.order - b.order)

    // Generate Gherkin steps with proper keywords
    let hasThenInPrevious = false
    let hasWhenInPrevious = false

    const gherkinSteps = validSteps.map((step, index) => {
      const gherkinStep = step.gherkinStep?.trim() || ''
      const firstWord = gherkinStep.split(' ')[0].toLowerCase()
      const hasGherkinKeyword = ['given', 'when', 'then'].includes(firstWord)
      const stepWithoutKeyword = hasGherkinKeyword ? gherkinStep.split(' ').slice(1).join(' ') : gherkinStep

      // First step always starts with Given
      if (index === 0) {
        return `Given ${stepWithoutKeyword}`
      }

      // Check if this step should be a Then statement
      const isThenStatement =
        firstWord === 'then' ||
        stepWithoutKeyword.toLowerCase().startsWith('should') ||
        stepWithoutKeyword.toLowerCase().startsWith('must') ||
        stepWithoutKeyword.toLowerCase().startsWith('will')

      // If we haven't seen a Then yet
      if (!hasThenInPrevious) {
        // If this is a Then statement
        if (isThenStatement) {
          hasThenInPrevious = true
          return `Then ${stepWithoutKeyword}`
        }

        // If we haven't seen a When yet, use When
        if (!hasWhenInPrevious) {
          hasWhenInPrevious = true
          return `When ${stepWithoutKeyword}`
        }
        // After When, use And
        return `And ${stepWithoutKeyword}`
      }

      // After Then
      if (isThenStatement) {
        // If it's another Then statement, use And
        return `And ${stepWithoutKeyword}`
      }
      // After Then, use When for new actions
      hasThenInPrevious = false
      hasWhenInPrevious = false
      return `When ${stepWithoutKeyword}`
    })

    // Update the flags after processing all steps
    hasThenInPrevious = gherkinSteps.some(step => step.toLowerCase().startsWith('then'))
    hasWhenInPrevious = gherkinSteps.some(step => step.toLowerCase().startsWith('when'))

    return [scenarioHeader, ...gherkinSteps].join('\n')
  }, [title, description, nodesOrder])

  // handlers
  const onNodeOrderChange = useCallback((nodesOrder: NodeOrderMap) => {
    setNodesOrder(nodesOrder)
  }, [])

  const onTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
  }, [])

  const onDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value)
  }, [])

  const onTestSuiteChange = useCallback((selectedTestSuites: string[]) => {
    setSelectedTestSuites(selectedTestSuites)
  }, [])

  const onTagChange = useCallback((selectedTags: string[]) => {
    setSelectedTags(selectedTags)
  }, [])

  const handleSubmit = useCallback(async () => {
    const result = errorSchema.safeParse({
      title,
      description,
      testSuiteIds: selectedTestSuites,
      tagIds: selectedTags,
      steps: Object.entries(nodesOrder).map(([, value]) => ({
        gherkinStep: value.gherkinStep || '',
        label: value.label,
        icon: IconToKeyTransformer(value.icon),
        parameters: value.parameters,
        order: value.order,
        templateStepId: value.templateStepId,
      })),
    })

    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors)
      return
    }
    setErrors({})
    const response = await onSubmitAction(result.data, id)
    if (response.status === 200) {
      toast({
        title: 'Success',
        description: 'Test case saved successfully',
        variant: 'default',
      })
      router.push(`/test-cases`)
    }
    if (response.status === 500) {
      toast({
        title: 'Error',
        description: response.error || 'An error occurred',
        variant: 'destructive',
      })
    }
  }, [description, nodesOrder, selectedTestSuites, selectedTags, title, router, onSubmitAction, id])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between gap-8" id="meta">
        <div className="w-1/2">
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" value={title} onChange={onTitleChange} />
            <ErrorMessage message={errors.title?.[0] || ''} visible={!!errors.title} />
          </div>
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" value={description} onChange={onDescriptionChange} />
            <ErrorMessage message={errors.description?.[0] || ''} visible={!!errors.description} />
          </div>
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="test-suites">Test Suites</Label>
            <MultiSelect
              options={testSuites.map(testSuite => {
                return {
                  label: testSuite.name,
                  value: testSuite.id,
                }
              })}
              selected={selectedTestSuites}
              onChange={onTestSuiteChange}
            />
            <ErrorMessage message={errors.testSuiteIds?.[0] || ''} visible={!!errors.testSuiteIds} />
          </div>
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="tags">Tags</Label>
            <MultiSelect
              options={tags.map(tag => {
                return {
                  label: tag.name,
                  value: tag.id,
                }
              })}
              selected={selectedTags}
              onChange={onTagChange}
            />
          </div>
        </div>
        <div className="w-1/2">
          <div className="mb-4 flex flex-col gap-2">
            <Card>
              <CardHeader>
                <CardTitle>Test Scenario(Preview)</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeMirror
                  editable={false}
                  value={generateGherkinSyntax()}
                  onChange={() => {}}
                  height="200px"
                  extensions={[langs.gherkin(), EditorView.lineWrapping]}
                  theme={githubDark}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <div className="mb-4 flex h-[500px] flex-col gap-2">
        <Label htmlFor="test-case-flow">Test Case Flow</Label>
        <TestCaseFlow
          initialNodesOrder={nodesOrder}
          templateStepParams={templateStepParams}
          templateSteps={templateSteps}
          onNodeOrderChange={onNodeOrderChange}
          locators={locators}
          locatorGroups={locatorGroups}
        />
      </div>
      <div className="mb-4 flex flex-col gap-2">
        <Button onClick={handleSubmit} className="w-fit px-6">
          Save
        </Button>
      </div>
    </div>
  )
}

export default TestCaseForm
