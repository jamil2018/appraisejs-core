import prisma from '@/config/db-config'
import { createOrUpdateEnvironmentsFile } from '@/lib/environment-file-utils'
import {
  createEmptyLocatorGroupFile,
  createOrUpdateLocatorGroupFile,
  deleteLocatorGroupFile,
  moveLocatorGroupFile,
  removeLocatorMapEntry,
  renameLocatorGroupFile,
  updateLocatorMapFile,
} from '@/lib/locator-group-file-utils'
import { deleteFeatureFile, generateFeatureFile, regenerateAllFeatureFiles } from '@/lib/feature-file-generator'
import { ensureAutomationWorkspaceReady } from './paths'

class AutomationProjectionService {
  async syncEnvironments(): Promise<boolean> {
    await ensureAutomationWorkspaceReady()
    return createOrUpdateEnvironmentsFile()
  }

  async createEmptyLocatorGroup(locatorGroupId: string): Promise<boolean> {
    await ensureAutomationWorkspaceReady()
    return createEmptyLocatorGroupFile(locatorGroupId)
  }

  async syncLocatorGroup(locatorGroupId: string): Promise<boolean> {
    await ensureAutomationWorkspaceReady()
    return createOrUpdateLocatorGroupFile(locatorGroupId)
  }

  async renameLocatorGroup(locatorGroupId: string, newName: string, oldName?: string): Promise<boolean> {
    await ensureAutomationWorkspaceReady()
    return renameLocatorGroupFile(locatorGroupId, newName, oldName)
  }

  async moveLocatorGroup(locatorGroupId: string, previousFilePath?: string): Promise<boolean> {
    await ensureAutomationWorkspaceReady()
    return moveLocatorGroupFile(locatorGroupId, previousFilePath)
  }

  async deleteLocatorGroup(locatorGroupId: string): Promise<boolean> {
    await ensureAutomationWorkspaceReady()
    return deleteLocatorGroupFile(locatorGroupId)
  }

  async syncLocatorMap(
    currentLocatorGroupRoute: string,
    newLocatorGroupRoute: string,
    currentLocatorGroupName: string,
    newLocatorGroupName: string,
  ): Promise<boolean>
  async syncLocatorMap(newLocatorGroupName: string, newLocatorGroupRoute: string): Promise<boolean>
  async syncLocatorMap(param1: string, param2: string, param3?: string, param4?: string): Promise<boolean> {
    await ensureAutomationWorkspaceReady()
    if (param3 === undefined || param4 === undefined) {
      return updateLocatorMapFile(param1, param2)
    }

    return updateLocatorMapFile(param1, param2, param3, param4)
  }

  async deleteLocatorMapEntries(locatorGroupNames: string[]): Promise<boolean> {
    await ensureAutomationWorkspaceReady()
    return removeLocatorMapEntry(locatorGroupNames)
  }

  async generateFeature(testSuiteId: string): Promise<string> {
    await ensureAutomationWorkspaceReady()

    const testSuite = await prisma.testSuite.findUnique({
      where: { id: testSuiteId },
      select: {
        name: true,
        description: true,
      },
    })

    if (!testSuite) {
      throw new Error(`Test suite ${testSuiteId} not found`)
    }

    return generateFeatureFile(testSuiteId, testSuite.name, testSuite.description || undefined)
  }

  async deleteFeature(testSuiteId: string): Promise<boolean> {
    await ensureAutomationWorkspaceReady()
    return deleteFeatureFile(testSuiteId)
  }

  async regenerateAllFeatures(): Promise<string[]> {
    await ensureAutomationWorkspaceReady()
    return regenerateAllFeatureFiles()
  }

  async regenerateAllPathDependentArtifacts(): Promise<void> {
    await ensureAutomationWorkspaceReady()

    const locatorGroups = await prisma.locatorGroup.findMany({
      select: { id: true },
    })

    await Promise.all([
      this.syncEnvironments(),
      ...locatorGroups.map(locatorGroup => this.syncLocatorGroup(locatorGroup.id)),
    ])

    await this.regenerateAllFeatures()
  }
}

export const automationProjectionService = new AutomationProjectionService()
