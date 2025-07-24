import {
  Locator,
  TemplateStep,
  TemplateStepParameter,
  TemplateTestCase,
  TemplateTestCaseStep,
  TemplateTestCaseStepParameter,
} from "@prisma/client";
import React from "react";
import TemplateTestCaseForm from "../../template-test-case-form";
import HeaderSubtitle from "@/components/typography/page-header-subtitle";
import PageHeader from "@/components/typography/page-header";
import {
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
} from "@/actions/template-step/template-step-actions";
import { getAllLocatorsAction } from "@/actions/locator/locator-actions";
import { TemplateTestCaseNodeOrderMap } from "@/types/diagram/diagram";
import {
  getTemplateTestCaseByIdAction,
  updateTemplateTestCaseAction,
} from "@/actions/template-test-case/template-test-case-actions";

const ModifyTemplateTestCase = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const { id } = await params;
  const { data, error } = await getTemplateTestCaseByIdAction(id);

  if (error) {
    return <div>Error: {error}</div>;
  }
  const templateTestCase = data as TemplateTestCase & {
    steps: (TemplateTestCaseStep & {
      parameters: TemplateTestCaseStepParameter[];
    })[];
  };
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
    <>
      <div className="mb-8">
        <PageHeader>Modify Template Test Case</PageHeader>
        <HeaderSubtitle>Modify a template test case</HeaderSubtitle>
      </div>
      <TemplateTestCaseForm
        onSubmitAction={updateTemplateTestCaseAction}
        id={id}
        defaultTitle={templateTestCase.name}
        defaultDescription={templateTestCase.description || ""}
        templateStepParams={templateStepParams as TemplateStepParameter[]}
        templateSteps={templateSteps as TemplateStep[]}
        locators={locators as Locator[]}
        defaultNodesOrder={templateTestCase.steps.reduce((acc, step) => {
          acc[step.id] = {
            order: step.order,
            label: step.label,
            gherkinStep: step.gherkinStep,
            icon: step.icon,
            parameters: (
              (step.parameters || []) as TemplateTestCaseStepParameter[]
            ).map((param: TemplateTestCaseStepParameter) => ({
              name: param.name,
              defaultValue: param.defaultValue,
              type: param.type,
              order: param.order,
            })),
            templateStepId: step.templateStepId,
          };
          return acc;
        }, {} as TemplateTestCaseNodeOrderMap)}
      />
    </>
  );
};

export default ModifyTemplateTestCase;
