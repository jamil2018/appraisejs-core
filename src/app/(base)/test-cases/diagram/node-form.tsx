import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NodeData } from "@/constants/form-opts/diagram/node-form";
import {
  Locator,
  StepParameterType,
  TemplateStep,
  TemplateStepIcon,
} from "@prisma/client";
import { TemplateStepParameter } from "@prisma/client";
import React, { useState, useEffect } from "react";
import DynamicFormFields from "./dynamic-parameters";
import { generateGherkinStep } from "@/lib/transformers/gherkin-converter";

const NodeForm = ({
  onSubmitAction,
  initialValues,
  templateSteps,
  templateStepParams,
  showAddNodeDialog,
  locators,
  setShowAddNodeDialog,
}: {
  onSubmitAction: (values: NodeData) => void;
  initialValues: NodeData;
  templateSteps: TemplateStep[];
  templateStepParams: TemplateStepParameter[];
  showAddNodeDialog: boolean;
  locators: Locator[];
  setShowAddNodeDialog: (show: boolean) => void;
}) => {
  // states for dynamic form fields
  const [selectedTemplateStep, setSelectedTemplateStep] =
    useState<TemplateStep | null>(
      templateSteps.find((step) => step.id === initialValues.templateStepId) ??
        null
    );
  const [selectedTemplateStepParams, setSelectedTemplateStepParams] = useState<
    TemplateStepParameter[]
  >(
    templateStepParams.filter(
      (param) => param.templateStepId === initialValues.templateStepId
    ) ?? []
  );
  const [parameters, setParameters] = useState<
    {
      name: string;
      value: string;
      type: StepParameterType;
      order: number;
    }[]
  >(initialValues.parameters ?? []);
  const [gherkinStep, setGherkinStep] = useState<string>(
    initialValues.gherkinStep ?? ""
  );

  // Synchronize state with initialValues when they change
  useEffect(() => {
    const step =
      templateSteps.find((step) => step.id === initialValues.templateStepId) ??
      null;
    setSelectedTemplateStep(step);
    setSelectedTemplateStepParams(
      templateStepParams.filter(
        (param) => param.templateStepId === initialValues.templateStepId
      )
    );
    setParameters(initialValues.parameters ?? []);
    setGherkinStep(initialValues.gherkinStep ?? "");
  }, [
    initialValues.templateStepId,
    initialValues.parameters,
    initialValues.gherkinStep,
    templateSteps,
    templateStepParams,
  ]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const values = Object.fromEntries(formData.entries());
    const nodeData: NodeData = {
      ...values,
      parameters: parameters,
      label: values.label as string,
      gherkinStep: gherkinStep,
      templateStepId: values.templateStepId as string,
    };
    onSubmitAction(nodeData);
  };

  return (
    <Dialog open={showAddNodeDialog} onOpenChange={setShowAddNodeDialog}>
      <DialogTrigger asChild>
        <Button type="button" onClick={(e) => e.preventDefault()}>
          Add Node
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Node</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Insert a new node to the diagram
          </DialogDescription>
          <div className="my-4">
            <div className="flex flex-col gap-2 mb-4">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                name="label"
                defaultValue={initialValues.label}
              />
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <Label htmlFor="templateStepId">Template Step</Label>
              <Select
                name="templateStepId"
                defaultValue={initialValues.templateStepId}
                onValueChange={(value) => {
                  const step = templateSteps.find((step) => step.id === value);
                  if (step) {
                    setSelectedTemplateStep(step);
                    setSelectedTemplateStepParams(
                      templateStepParams.filter(
                        (param) => param.templateStepId === step.id
                      )
                    );
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template step" />
                </SelectTrigger>
                <SelectContent>
                  {templateSteps.map((step) => (
                    <SelectItem key={step.id} value={step.id}>
                      {step.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <DynamicFormFields
                selectedTemplateStep={selectedTemplateStep as TemplateStep}
                templateStepParams={selectedTemplateStepParams}
                locators={locators.map((locator) => locator.name)}
                initialParameterValues={initialValues.parameters}
                onChange={(values) => {
                  setParameters([...values]);
                  // Generate gherkin step directly when parameters change
                  if (selectedTemplateStep && selectedTemplateStep.signature) {
                    const gherkin = generateGherkinStep(
                      selectedTemplateStep.type,
                      selectedTemplateStep.signature,
                      values
                    );
                    setGherkinStep(gherkin);
                  }
                }}
              />
            </div>
            {selectedTemplateStep && (
              <div className="flex flex-col gap-2 mb-4">
                <Label htmlFor="gherkinStep">Gherkin Step</Label>
                <Input
                  disabled
                  id="gherkinStep"
                  name="gherkinStep"
                  value={gherkinStep}
                />
              </div>
            )}
            <input
              type="hidden"
              name="icon"
              value={
                selectedTemplateStep?.icon
                  ? selectedTemplateStep.icon
                  : TemplateStepIcon.MOUSE
              }
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NodeForm;
