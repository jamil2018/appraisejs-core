'use client'

import { TestSuiteForm } from '@/app/(base)/test-suites/test-suite-form'
import type { TestSuiteFormSubmitAction } from '@/app/(base)/test-suites/test-suite-helpers'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { TestCasePickerRow } from '@/types/test-case-picker'
import type { Module, Tag, TestSuite } from '@prisma/client'

type InlineTestSuiteCreationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitAction: TestSuiteFormSubmitAction
  onSuccess: (suite: TestSuite) => void | Promise<void>
  testCases: TestCasePickerRow[]
  moduleList: Module[]
  tags: Tag[]
}

export function InlineTestSuiteCreationDialog({
  open,
  onOpenChange,
  onSubmitAction,
  onSuccess,
  testCases,
  moduleList,
  tags,
}: InlineTestSuiteCreationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Create Test Suite</DialogTitle>
          <DialogDescription>Create a new test suite without leaving the current test case.</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-4">
          <TestSuiteForm
            successTitle="Suite created"
            successMessage="Test suite created successfully"
            onSubmitAction={onSubmitAction}
            onSuccess={onSuccess}
            redirectPath={null}
            testCases={testCases}
            moduleList={moduleList}
            tags={tags}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
