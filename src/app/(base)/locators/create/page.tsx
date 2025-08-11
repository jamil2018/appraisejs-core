import PageHeader from "@/components/typography/page-header";
import HeaderSubtitle from "@/components/typography/page-header-subtitle";
import React from "react";
import LocatorForm from "../locator-form";
import { createLocatorAction } from "@/actions/locator/locator-actions";
import { getAllModulesAction } from "@/actions/modules/module-actions";
import { Module } from "@prisma/client";

const CreateLocator = async () => {
  const { data: moduleList, error: moduleListError } =
    await getAllModulesAction();

  if (moduleListError) {
    return <div>Error: {moduleListError}</div>;
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Locator</PageHeader>
        <HeaderSubtitle>
          Create a new locator to be used in your test cases.
        </HeaderSubtitle>
      </div>
      <LocatorForm
        successTitle="Locator created"
        successMessage="Locator created successfully"
        onSubmitAction={createLocatorAction}
        moduleList={moduleList as Module[]}
      />
    </>
  );
};

export default CreateLocator;
