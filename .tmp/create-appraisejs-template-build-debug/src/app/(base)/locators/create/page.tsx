import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import LocatorForm from '../locator-form'
import { createLocatorAction } from '@/actions/locator/locator-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { LocatorGroup } from '@prisma/client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Create Locator',
  description: 'Create a new locator to be used in your test cases',
}

const CreateLocator = async () => {
  const { data: locatorGroupList, error: locatorGroupListError } = await getAllLocatorGroupsAction()

  if (locatorGroupListError) {
    return <div>Error: {locatorGroupListError}</div>
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Locator</PageHeader>
        <HeaderSubtitle>Create a new locator to be used in your test cases.</HeaderSubtitle>
      </div>
      <LocatorForm
        successTitle="Locator created"
        successMessage="Locator created successfully"
        onSubmitAction={createLocatorAction}
        locatorGroupList={locatorGroupList as LocatorGroup[]}
      />
    </>
  )
}

export default CreateLocator
