import { TemplateStepType } from "@prisma/client";

export const generateGherkinStep = (
  type: TemplateStepType,
  signature: string,
  parameters: { value: string; order: number }[]
) => {
  // console.log(signature, parameters);
  const signatureParts = signature.split(" ");
  const sortedParameters = parameters.sort((a, b) => a.order - b.order);

  const gherkinStep = signatureParts
    .map((part) => {
      if (part === "{string}" || part === "{int}" || part === "{boolean}") {
        const parameter = sortedParameters.shift();
        if (!parameter) {
          return part;
        }
        if (part === "{string}") {
          return `"${parameter?.value}"`;
        }
        if (part === "{int}") {
          return `${parameter?.value}`;
        }
        if (part === "{boolean}") {
          return `${parameter?.value}`;
        }
      }
      return part;
    })
    .join(" ");

  // Prepend the appropriate Gherkin keyword based on type
  const keyword = type === "ACTION" ? "When" : "Then";
  return `${keyword} ${gherkinStep}`;
};
