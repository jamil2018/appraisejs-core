import { updateTemplateStepAction } from "@/actions/template-step/template-step-actions";
import { getTemplateStepByIdAction } from "@/actions/template-step/template-step-actions";
import { TemplateStepForm } from "../../template-step-form";
import { TemplateStep, TemplateStepParameter } from "@prisma/client";

export default async function ModifyTemplateStepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data, error } = await getTemplateStepByIdAction(id);

  if (error) {
    return <div>Error: {error}</div>;
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
      }}
      id={id}
    />
  );
}
