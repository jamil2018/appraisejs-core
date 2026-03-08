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
import {
  createTemplateStepGroupFile,
  removeTemplateStepGroupFile,
  renameTemplateStepGroupFile,
} from '@/lib/utils/template-step-file-manager-intelligent'
import { generateFileContent, writeTemplateStepFile } from '@/lib/utils/template-step-file-generator'
import { ensureAutomationWorkspaceReady } from './paths'

type TemplateStepGroupType = 'ACTION' | 'VALIDATION'

function getTemplateStepGroupType(type: string | null | undefined): TemplateStepGroupType {
  return type === 'VALIDATION' ? 'VALIDATION' : 'ACTION'
}

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

  async syncTemplateStepGroup(groupId: string): Promise<void> {
    await ensureAutomationWorkspaceReady()

    const group = await prisma.templateStepGroup.findUnique({
      where: { id: groupId },
      include: {
        templateSteps: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    })

    if (!group) {
      return
    }

    const groupType = getTemplateStepGroupType((group as { type?: string | null }).type)

    if (group.templateSteps.length === 0) {
      await createTemplateStepGroupFile(group.name, groupType, group.description)
      return
    }

    const content = generateFileContent(group.templateSteps)
    await writeTemplateStepFile(group.name, content, groupType)
  }

  async deleteTemplateStepGroup(groupId: string): Promise<void> {
    await ensureAutomationWorkspaceReady()

    const group = await prisma.templateStepGroup.findUnique({
      where: { id: groupId },
      select: {
        name: true,
        type: true,
      },
    })

    if (!group) {
      return
    }

    await removeTemplateStepGroupFile(group.name, getTemplateStepGroupType(group.type))
  }

  async renameTemplateStepGroup(
    groupId: string,
    newName: string,
    newType: string,
    newDescription?: string | null,
  ): Promise<void> {
    await ensureAutomationWorkspaceReady()

    const currentGroup = await prisma.templateStepGroup.findUnique({
      where: { id: groupId },
      select: {
        name: true,
        type: true,
      },
    })

    if (!currentGroup) {
      return
    }

    await renameTemplateStepGroupFile(
      currentGroup.name,
      newName,
      getTemplateStepGroupType(currentGroup.type),
      getTemplateStepGroupType(newType),
      newDescription,
    )
  }

  async syncTemplateStep(stepId: string): Promise<void> {
    const step = await prisma.templateStep.findUnique({
      where: { id: stepId },
      select: { templateStepGroupId: true },
    })

    if (!step?.templateStepGroupId) {
      return
    }

    await this.syncTemplateStepGroup(step.templateStepGroupId)
  }

  async deleteTemplateStep(stepId: string): Promise<void> {
    const step = await prisma.templateStep.findUnique({
      where: { id: stepId },
      select: { templateStepGroupId: true },
    })

    if (!step?.templateStepGroupId) {
      return
    }

    await this.syncTemplateStepGroup(step.templateStepGroupId)
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

    const templateStepGroups = await prisma.templateStepGroup.findMany({
      select: { id: true },
    })

    await Promise.all([
      this.syncEnvironments(),
      ...locatorGroups.map(locatorGroup => this.syncLocatorGroup(locatorGroup.id)),
      ...templateStepGroups.map(group => this.syncTemplateStepGroup(group.id)),
    ])

    await this.regenerateAllFeatures()
  }
}

export const automationProjectionService = new AutomationProjectionService()
