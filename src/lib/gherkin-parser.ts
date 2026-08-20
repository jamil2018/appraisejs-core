import { promises as fs } from 'fs'
import {
  getAppraiseMetadataPath,
  getMetadataByIdentifier,
  readAppraiseMetadataFile,
  type AppraiseTestCaseMetadataEntry,
} from '@/lib/appraise-test-case-metadata'

/**
 * Represents a parsed feature file with its scenarios and steps
 */
export interface ParsedFeature {
  filePath: string
  featureName: string
  featureDescription?: string
  tags: string[]
  scenarios: ParsedScenario[]
  metadataWarnings: string[]
}

/**
 * Represents a parsed scenario from a feature file
 */
export interface ParsedScenario {
  name: string
  description?: string
  tags: string[]
  steps: ParsedStep[]
  appraiseMetadata?: AppraiseTestCaseMetadataEntry
}

/**
 * Represents a parsed step from a feature file
 */
export interface ParsedStep {
  keyword: string
  text: string
  order: number
  appraiseNode?: AppraiseTestCaseMetadataEntry['nodes'][number]
}

const STEP_KEYWORDS = ['Given', 'When', 'Then', 'And', 'But'] as const

type ParsedScenarioHeader = Pick<ParsedScenario, 'name' | 'description'>

function normalizeGherkinLines(content: string) {
  return content.split('\n').map(line => line.trim())
}

function isSkippableLine(line: string) {
  return line === '' || line.startsWith('#')
}

function collectPrecedingTags(lines: string[], startIndex: number) {
  const tags: string[] = []

  for (let i = startIndex - 1; i >= 0; i--) {
    const line = lines[i]
    if (isSkippableLine(line)) {
      continue
    }

    if (line.startsWith('@')) {
      tags.unshift(line)
      continue
    }

    break
  }

  return tags
}

function getFeatureTags(lines: string[]) {
  const featureIndex = lines.findIndex(line => line.startsWith('Feature:'))
  return featureIndex === -1 ? [] : collectPrecedingTags(lines, featureIndex)
}

function parseScenarioHeader(line: string): ParsedScenarioHeader {
  const scenarioText = line.replace('Scenario:', '').trim()
  const [descriptionPart, ...nameParts] = scenarioText.split(']')

  if (nameParts.length === 0) {
    return { name: scenarioText }
  }

  const name = nameParts.join(']').trim()
  const description = descriptionPart.replace('[', '').trim()

  return {
    name,
    description: description || undefined,
  }
}

function parseStep(line: string, order: number): ParsedStep | null {
  const keyword = STEP_KEYWORDS.find(keyword => line.startsWith(`${keyword} `))
  if (!keyword) {
    return null
  }

  return {
    keyword,
    text: line.substring(keyword.length).trim(),
    order,
  }
}

function parseFeatureLine(line: string) {
  return line.replace('Feature:', '').trim()
}

function normalizeTagExpression(tagExpression: string): string {
  return tagExpression.startsWith('@') ? tagExpression : `@${tagExpression}`
}

function getScenarioIdentifierTag(scenario: ParsedScenario): string | null {
  for (const tagLine of scenario.tags) {
    const tags = tagLine.split(/\s+/).filter(tag => tag.trim().startsWith('@'))
    const identifierTag = tags.find(tag => normalizeTagExpression(tag).replace(/^@/, '').startsWith('tc_'))

    if (identifierTag) {
      return normalizeTagExpression(identifierTag)
    }
  }

  return null
}

function startScenario(lines: string[], index: number): ParsedScenario {
  const { name, description } = parseScenarioHeader(lines[index])

  return {
    name,
    description,
    tags: collectPrecedingTags(lines, index),
    steps: [],
  }
}

function parseGherkinLines(lines: string[]) {
  const scenarios: ParsedScenario[] = []
  let featureName = ''
  let featureDescription = ''
  let currentScenario: ParsedScenario | null = null
  let stepOrder = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (isSkippableLine(line)) {
      continue
    }

    if (line.startsWith('Feature:')) {
      const featureLineText = parseFeatureLine(line)
      featureName = featureLineText
      featureDescription = featureLineText
      continue
    }

    if (line.startsWith('Scenario:')) {
      if (currentScenario) {
        scenarios.push(currentScenario)
      }

      currentScenario = startScenario(lines, i)
      stepOrder = 1
      continue
    }

    if (!currentScenario) {
      continue
    }

    const step = parseStep(line, stepOrder)
    if (step) {
      currentScenario.steps.push(step)
      stepOrder++
    }
  }

  if (currentScenario) {
    scenarios.push(currentScenario)
  }

  return { featureName, featureDescription, scenarios }
}

/**
 * Parses a Gherkin feature file and extracts scenarios and steps
 * @param filePath - Path to the feature file
 * @returns Promise<ParsedFeature | null> - Parsed feature data or null if parsing fails
 */
export async function parseFeatureFile(filePath: string): Promise<ParsedFeature | null> {
  try {
    const [content, metadataResult] = await Promise.all([
      fs.readFile(filePath, 'utf-8'),
      readAppraiseMetadataFile(getAppraiseMetadataPath(filePath)),
    ])
    const lines = normalizeGherkinLines(content)
    const featureTags = getFeatureTags(lines)
    const { featureName, featureDescription, scenarios } = parseGherkinLines(lines)
    const metadataByIdentifier = getMetadataByIdentifier(metadataResult.metadata)

    for (const scenario of scenarios) {
      const identifierTag = getScenarioIdentifierTag(scenario)
      if (identifierTag) {
        scenario.appraiseMetadata = metadataByIdentifier.get(identifierTag)
      }
    }

    if (!featureName) {
      console.warn(`No feature found in file: ${filePath}`)
      return null
    }

    return {
      filePath,
      featureName,
      featureDescription: featureDescription || undefined,
      tags: featureTags,
      scenarios,
      metadataWarnings: metadataResult.warnings,
    }
  } catch (error) {
    console.error(`Error parsing feature file ${filePath}:`, error)
    return null
  }
}

/**
 * Scans a directory for feature files and parses them
 * @param directoryPath - Path to scan for feature files
 * @returns Promise<ParsedFeature[]> - Array of parsed feature files
 */
