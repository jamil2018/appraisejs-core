import PageHeader from "@/components/typography/page-header";
import HeaderSubtitle from "@/components/typography/page-header-subtitle";
import React from "react";
import TestCaseForm from "../test-case-form";
import {
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
} from "@/actions/template-step/template-step-actions";
import {
  Locator,
  TemplateStep,
  TemplateStepParameter,
  TestSuite,
} from "@prisma/client";
import { getAllLocatorsAction } from "@/actions/locator/locator-actions";
import { getAllTestSuitesAction } from "@/actions/test-suite/test-suite-actions";
import { createTestCaseAction } from "@/actions/test-case/test-case-actions";

const CreateTestCase = async () => {
  const { data: templateStepParams, error: templateStepParamsError } =
    await getAllTemplateStepParamsAction();

  const { data: templateSteps, error: templateStepsError } =
    await getAllTemplateStepsAction();

  const { data: testSuites, error: testSuitesError } =
    await getAllTestSuitesAction();

  const { data: locators, error: locatorsError } = await getAllLocatorsAction();

  if (
    templateStepParamsError ||
    templateStepsError ||
    locatorsError ||
    testSuitesError
  ) {
    return (
      <div>
        Error:{" "}
        {templateStepParamsError ||
          templateStepsError ||
          locatorsError ||
          testSuitesError}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <PageHeader>Create New Test Case</PageHeader>
        <HeaderSubtitle>
          Create a new test from scratch to execute against your application
        </HeaderSubtitle>
      </div>
      <TestCaseForm
        defaultNodesOrder={{}}
        templateStepParams={templateStepParams as TemplateStepParameter[]}
        templateSteps={templateSteps as TemplateStep[]}
        locators={locators as Locator[]}
        testSuites={testSuites as TestSuite[]}
        onSubmitAction={createTestCaseAction}
      />
    </div>
  );
};

export default CreateTestCase;
