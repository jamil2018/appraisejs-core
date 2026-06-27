import type { Environment, Locator, LocatorGroup, Module, Tag, TestSuite } from '@prisma/client'

import type { ActionResponseData } from '@/types/form/actionHandler'

export function isNamedRow(value: unknown): value is { id: string; name: string } {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isLocatorRow(value: unknown): value is Locator {
  return isNamedRow(value)
}

function isModuleRow(value: unknown): value is Module {
  return isNamedRow(value)
}

function isTestSuiteRow(value: unknown): value is TestSuite {
  return isNamedRow(value)
}

function isLocatorGroupRow(value: unknown): value is LocatorGroup {
  return isNamedRow(value)
}

function isEnvironmentRow(value: unknown): value is Environment {
  return isNamedRow(value)
}

function isTagRow(value: unknown): value is Tag {
  return isNamedRow(value)
}

export function getLocatorRows(data: ActionResponseData | undefined): Locator[] {
  return Array.isArray(data) ? data.filter(isLocatorRow) : []
}

export function getModuleRows(data: ActionResponseData | undefined): Module[] {
  return Array.isArray(data) ? data.filter(isModuleRow) : []
}

export function getTestSuiteRows(data: ActionResponseData | undefined): TestSuite[] {
  return Array.isArray(data) ? data.filter(isTestSuiteRow) : []
}

export function getLocatorGroupRows(data: ActionResponseData | undefined): LocatorGroup[] {
  return Array.isArray(data) ? data.filter(isLocatorGroupRow) : []
}

export function getEnvironmentRows(data: ActionResponseData | undefined): Environment[] {
  return Array.isArray(data) ? data.filter(isEnvironmentRow) : []
}

export function getTagRows(data: ActionResponseData | undefined): Tag[] {
  return Array.isArray(data) ? data.filter(isTagRow) : []
}
