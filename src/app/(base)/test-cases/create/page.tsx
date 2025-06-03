import PageHeader from "@/components/typography/page-header";
import HeaderSubtitle from "@/components/typography/page-header-subtitle";
import React from "react";
import TestCaseForm from "../test-case-form";
import {
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
} from "@/actions/template-step/template-step-actions";
import { Locator, TemplateStep, TemplateStepParameter } from "@prisma/client";
import { getAllLocatorsAction } from "@/actions/locator/locator-actions";

const CreateTestCase = async () => {
  const { data: templateStepParams, error: templateStepParamsError } =
    await getAllTemplateStepParamsAction();

  const { data: templateSteps, error: templateStepsError } =
    await getAllTemplateStepsAction();

  const { data: locators, error: locatorsError } = await getAllLocatorsAction();

  if (templateStepParamsError || templateStepsError || locatorsError) {
    return (
      <div>
        Error: {templateStepParamsError || templateStepsError || locatorsError}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <PageHeader>Create Test Case</PageHeader>
        <HeaderSubtitle>
          Create a new test case to run your tests against
        </HeaderSubtitle>
      </div>
      <TestCaseForm
        defaultNodesOrder={{}}
        templateStepParams={templateStepParams as TemplateStepParameter[]}
        templateSteps={templateSteps as TemplateStep[]}
        locators={locators as Locator[]}
      />
    </div>
  );
};

export default CreateTestCase;
