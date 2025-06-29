import PageHeader from "@/components/typography/page-header";
import HeaderSubtitle from "@/components/typography/page-header-subtitle";
import React from "react";
import LocatorForm from "../locator-form";
import { createLocatorAction } from "@/actions/locator/locator-actions";
import LocatorInspector from "@/components/data-extraction/locator-inspector";

const CreateLocator = () => {
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
      />
      <LocatorInspector iframeUrl="https://192.168.76.136/" />
    </>
  );
};

export default CreateLocator;
