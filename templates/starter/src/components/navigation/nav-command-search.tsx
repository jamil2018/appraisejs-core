'use client'

import type { ActionResponseData } from '@/types/form/actionHandler'
import type { TemplateStep, TemplateTestCase, TestCase, TestRun, TestSuite } from '@prisma/client'
import { Blocks, LayoutTemplate, ListChecks, TestTubeDiagonal, TestTubes } from 'lucide-react'

import { getAllTemplateTestCasesAction } from '@/actions/template-test-case/template-test-case-actions'
import { getAllTemplateStepsAction } from '@/actions/template-step/template-step-actions'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { getAllTestRunsAction } from '@/actions/test-run/test-run-actions'
import { getAllTestSuitesAction } from '@/actions/test-suite/test-suite-actions'

import { EntitySearchCommand } from './entity-search-command'
import type { SearchCommandMode } from './nav-command-helpers'

type NavCommandSearchProps = {
  commandMode: SearchCommandMode
  searchQuery: string
  onSelectRoute: (href: string) => void
}

function isTestSuiteRow(value: unknown): value is TestSuite {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isTestCaseRow(value: unknown): value is TestCase {
  return typeof value === 'object' && value !== null && 'id' in value && 'title' in value
}

function isTemplateStepRow(value: unknown): value is TemplateStep {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isTestRunRow(value: unknown): value is TestRun {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isTemplateTestCaseRow(value: unknown): value is TemplateTestCase {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function getTestSuiteRows(data: ActionResponseData | undefined): TestSuite[] {
  return Array.isArray(data) ? data.filter(isTestSuiteRow) : []
}

function getTestCaseRows(data: ActionResponseData | undefined): TestCase[] {
  return Array.isArray(data) ? data.filter(isTestCaseRow) : []
}

function getTemplateStepRows(data: ActionResponseData | undefined): TemplateStep[] {
  return Array.isArray(data) ? data.filter(isTemplateStepRow) : []
}

function getTestRunRows(data: ActionResponseData | undefined): TestRun[] {
  return Array.isArray(data) ? data.filter(isTestRunRow) : []
}

function getTemplateTestCaseRows(data: ActionResponseData | undefined): TemplateTestCase[] {
  return Array.isArray(data) ? data.filter(isTemplateTestCaseRow) : []
}

export function NavCommandSearch({ commandMode, searchQuery, onSelectRoute }: NavCommandSearchProps) {
  switch (commandMode) {
    case 'search-test-suite':
      return (
        <EntitySearchCommand
          searchQuery={searchQuery}
          entityName="Test Suite"
          fetchAction={getAllTestSuitesAction}
          getEntities={getTestSuiteRows}
          searchKey="name"
          icon={<TestTubes className="h-4 w-4" />}
          onSelect={testSuite => onSelectRoute(`/test-suites/modify/${testSuite.id}`)}
        />
      )
    case 'search-test-case':
      return (
        <EntitySearchCommand
          searchQuery={searchQuery}
          entityName="Test Case"
          fetchAction={getAllTestCasesAction}
          getEntities={getTestCaseRows}
          searchKey="title"
          icon={<TestTubeDiagonal className="h-4 w-4" />}
          onSelect={testCase => onSelectRoute(`/test-cases/modify/${testCase.id}`)}
        />
      )
    case 'search-template-step':
      return (
        <EntitySearchCommand
          searchQuery={searchQuery}
          entityName="Template Step"
          fetchAction={getAllTemplateStepsAction}
          getEntities={getTemplateStepRows}
          searchKey="name"
          icon={<LayoutTemplate className="h-4 w-4" />}
          onSelect={templateStep => onSelectRoute(`/template-steps/modify/${templateStep.id}`)}
        />
      )
    case 'search-test-run':
      return (
        <EntitySearchCommand
          searchQuery={searchQuery}
          entityName="Test Run"
          fetchAction={getAllTestRunsAction}
          getEntities={getTestRunRows}
          searchKey="name"
          icon={<ListChecks className="h-4 w-4" />}
          onSelect={testRun => onSelectRoute(`/test-runs/${testRun.id}`)}
        />
      )
    case 'search-template-test-case':
      return (
        <EntitySearchCommand
          searchQuery={searchQuery}
          entityName="Template Test Case"
          fetchAction={getAllTemplateTestCasesAction}
          getEntities={getTemplateTestCaseRows}
          searchKey="name"
          icon={<Blocks className="h-4 w-4" />}
          onSelect={templateTestCase => onSelectRoute(`/template-test-cases/modify/${templateTestCase.id}`)}
        />
      )
  }
}
