import { updateTemplateStepAction } from "@/actions/template-step/template-step-actions";
import { getTemplateStepByIdAction } from "@/actions/template-step/template-step-actions";
import { TemplateStepForm } from "../../template-step-form";
import { TemplateStep, TemplateStepParameter } from "@prisma/client";
import { getAllTemplateStepGroupsAction } from "@/actions/template-step-group/template-step-group-actions";

export default async function ModifyTemplateStepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data, error } = await getTemplateStepByIdAction(id);
  const { data: templateStepGroups, error: templateStepGroupsError } =
    await getAllTemplateStepGroupsAction();

  if (error || templateStepGroupsError) {
    return <div>Error: {error || templateStepGroupsError}</div>;
  }

  const templateStep = data as TemplateStep & {
    parameters: TemplateStepParameter[];
  };
  return (
    <TemplateStepForm
      successTitle="Template step modified"
      successMessage="The template step has been modified"
      onSubmitAction={updateTemplateStepAction}
      defaultValues={{
        name: templateStep.name,
        type: templateStep.type,
        signature: templateStep.signature,
        icon: templateStep.icon,
        description: templateStep.description || "",
        functionDefinition: templateStep.functionDefinition || "",
        params: templateStep.parameters.map((param) => ({
          id: param.id,
          name: param.name,
          type: param.type,
          order: param.order,
        })),
        templateStepGroupId: templateStep.templateStepGroupId || "",
      }}
      id={id}
      templateStepGroups={
        templateStepGroups as Array<{ id: string; name: string }>
      }
    />
  );
}
