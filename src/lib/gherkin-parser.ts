import { promises as fs } from 'fs'
import { join, relative } from 'path'

/**
 * Represents a parsed feature file with its scenarios and steps
 */
export interface ParsedFeature {
  filePath: string
  featureName: string
  featureDescription?: string
  tags: string[]
  scenarios: ParsedScenario[]
}

/**
 * Represents a parsed scenario from a feature file
 */
export interface ParsedScenario {
  name: string
  description?: string
  tags: string[]
  steps: ParsedStep[]
}

/**
 * Represents a parsed step from a feature file
 */
export interface ParsedStep {
  keyword: string
  text: string
  order: number
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

    const step = currentScenario ? parseStep(line, stepOrder) : null
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
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = normalizeGherkinLines(content)
    const featureTags = getFeatureTags(lines)
    const { featureName, featureDescription, scenarios } = parseGherkinLines(lines)

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
export async function scanFeatureFiles(directoryPath: string): Promise<ParsedFeature[]> {
  const parsedFeatures: ParsedFeature[] = []

  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(directoryPath, entry.name)

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subFeatures = await scanFeatureFiles(fullPath)
        parsedFeatures.push(...subFeatures)
      } else if (entry.isFile() && entry.name.endsWith('.feature')) {
        // Parse feature file
        const parsedFeature = await parseFeatureFile(fullPath)
        if (parsedFeature) {
          parsedFeatures.push(parsedFeature)
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${directoryPath}:`, error)
  }

  return parsedFeatures
}

/**
 * Extracts module path from feature file path
 * Works cross-platform (Windows, Mac, Linux)
 * @param featureFilePath - Full path to the feature file
 * @param featuresBaseDir - Base directory for features
 * @returns string - Module path (e.g., "/module1/submodule")
 */
export function extractModulePathFromFilePath(featureFilePath: string, featuresBaseDir: string): string {
  // Use path.relative for cross-platform path handling
  const relativePath = relative(featuresBaseDir, featureFilePath)

  // Normalize to forward slashes for module path format (database uses /)
  const normalizedPath = relativePath.replace(/\\/g, '/')
  const pathParts = normalizedPath.split('/').filter(part => part && part !== '')

  // Remove the filename and join the remaining parts
  const moduleParts = pathParts.slice(0, -1)
  return moduleParts.length > 0 ? '/' + moduleParts.join('/') : '/'
}
