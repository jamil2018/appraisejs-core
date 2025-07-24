import { StepParameterType } from "@prisma/client";

export type NodeData = {
  order: number;
  label: string;
  gherkinStep?: string;
  isFirstNode?: boolean;
  icon?: string;
  parameters: {
    name: string;
    value: string;
    type: StepParameterType;
    order: number;
  }[];
  templateStepId: string;
};

export type NodeOrderMap = Record<string, NodeData>;

export type TemplateTestCaseNodeData = {
  order: number;
  label: string;
  gherkinStep?: string;
  icon?: string;
  parameters: {
    name: string;
    defaultValue: string;
    type: StepParameterType;
    order: number;
  }[];
  templateStepId: string;
};

export type TemplateTestCaseNodeOrderMap = Record<
  string,
  TemplateTestCaseNodeData
>;
