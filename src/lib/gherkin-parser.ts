import { promises as fs } from 'fs'
import { join, relative } from 'path'

/**
 * Represents a parsed feature file with its scenarios and steps
 */
export interface ParsedFeature {
  filePath: string
  featureName: string
  featureDescription?: string
  scenarios: ParsedScenario[]
}

/**
 * Represents a parsed scenario from a feature file
 */
export interface ParsedScenario {
  name: string
  description?: string
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

/**
 * Parses a Gherkin feature file and extracts scenarios and steps
 * @param filePath - Path to the feature file
 * @returns Promise<ParsedFeature | null> - Parsed feature data or null if parsing fails
 */
export async function parseFeatureFile(filePath: string): Promise<ParsedFeature | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')

    // Simple Gherkin parser implementation
    const lines = content.split('\n').map(line => line.trim())
    const scenarios: ParsedScenario[] = []

    let featureName = ''
    let featureDescription = ''
    let currentScenario: ParsedScenario | null = null
    let stepOrder = 1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip comments and empty lines
      if (line.startsWith('#') || line === '') {
        continue
      }

      // Parse Feature line
      if (line.startsWith('Feature:')) {
        featureName = line.replace('Feature:', '').trim()
        // Look for description in next lines
        let j = i + 1
        while (j < lines.length && lines[j] && !lines[j].startsWith('Scenario:') && !lines[j].startsWith('Feature:')) {
          if (lines[j] && !lines[j].startsWith('#')) {
            featureDescription += (featureDescription ? ' ' : '') + lines[j]
          }
          j++
        }
        continue
      }

      // Parse Scenario line
      if (line.startsWith('Scenario:')) {
        // Save previous scenario if exists
        if (currentScenario) {
          scenarios.push(currentScenario)
        }

        const scenarioText = line.replace('Scenario:', '').trim()
        const [name, description] =
          scenarioText.split(']').length > 1
            ? [scenarioText.split(']')[1].trim(), scenarioText.split(']')[0].replace('[', '').trim()]
            : [scenarioText, '']

        currentScenario = {
          name: name,
          description: description || undefined,
          steps: [],
        }
        stepOrder = 1
        continue
      }

      // Parse steps (Given, When, Then, And, But)
      if (
        currentScenario &&
        (line.startsWith('Given ') ||
          line.startsWith('When ') ||
          line.startsWith('Then ') ||
          line.startsWith('And ') ||
          line.startsWith('But '))
      ) {
        const keyword = line.split(' ')[0]
        const text = line.substring(keyword.length).trim()

        currentScenario.steps.push({
          keyword: keyword,
          text: text,
          order: stepOrder++,
        })
      }
    }

    // Add the last scenario
    if (currentScenario) {
      scenarios.push(currentScenario)
    }

    if (!featureName) {
      console.warn(`No feature found in file: ${filePath}`)
      return null
    }

    return {
      filePath,
      featureName,
      featureDescription: featureDescription || undefined,
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

/**
 * Generates a safe test suite name from feature name
 * @param featureName - Name of the feature
 * @returns string - Safe test suite name
 */
export function generateSafeTestSuiteName(featureName: string): string {
  return featureName
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Generates a safe test case name from scenario name
 * @param scenarioName - Name of the scenario
 * @returns string - Safe test case name
 */
export function generateSafeTestCaseName(scenarioName: string): string {
  // Remove scenario prefix if present and clean up the name
  const cleanName = scenarioName
    .replace(/^Scenario:\s*/i, '')
    .replace(/^\[.*?\]\s*/, '') // Remove [brackets] prefix
    .trim()

  return cleanName
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
