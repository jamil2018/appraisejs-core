"use client";
import React, { useCallback, useState } from "react";
import TestCaseFlow from "./test-case-flow";
import { NodeOrderMap } from "@/types/diagram/diagram";
import {
  Locator,
  StepParameterType,
  TemplateStep,
  TemplateStepIcon,
  TemplateStepParameter,
  TestSuite,
} from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
import { Button } from "@/components/ui/button";
import ErrorMessage from "@/components/form/error-message";
import { z } from "zod";
import { createTestCaseAction } from "@/actions/test-case/test-case-actions";
import { toast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { IconToKeyTransformer } from "@/lib/transformers/key-to-icon-transformer";

const errorSchema = z.object({
  title: z.string().min(3, { message: "Title must be at least 3 characters" }),
  description: z.string().optional(),
  testSuiteIds: z
    .array(z.string())
    .min(1, { message: "Test suites are required" }),
  steps: z.array(
    z.object({
      gherkinStep: z.string(),
      label: z.string(),
      icon: z.nativeEnum(TemplateStepIcon),
      parameters: z.array(
        z.object({
          name: z.string(),
          value: z.string(),
          type: z.nativeEnum(StepParameterType),
          order: z.number(),
        })
      ),
      order: z.number(),
    })
  ),
});

const TestCaseForm = ({
  defaultNodesOrder,
  templateStepParams,
  templateSteps,
  locators,
  testSuites,
}: {
  defaultNodesOrder: NodeOrderMap;
  templateStepParams: TemplateStepParameter[];
  templateSteps: TemplateStep[];
  locators: Locator[];
  testSuites: TestSuite[];
}) => {
  const router = useRouter();
  // states
  const [nodesOrder, setNodesOrder] = useState<NodeOrderMap>(defaultNodesOrder);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [selectedTestSuites, setSelectedTestSuites] = useState<string[]>([]);
  const [errors, setErrors] = useState<{
    title?: string[];
    description?: string[];
    testSuiteIds?: string[];
  }>({});

  // handlers
  const onNodeOrderChange = useCallback((nodesOrder: NodeOrderMap) => {
    setNodesOrder(nodesOrder);
  }, []);

  const onTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value);
    },
    []
  );

  const onDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDescription(e.target.value);
    },
    []
  );

  const onTestSuiteChange = useCallback((selectedTestSuites: string[]) => {
    setSelectedTestSuites(selectedTestSuites);
  }, []);

  const handleSubmit = useCallback(async () => {
    const result = errorSchema.safeParse({
      title,
      description,
      testSuiteIds: selectedTestSuites,
      steps: Object.entries(nodesOrder).map(([, value]) => ({
        gherkinStep: value.gherkinStep || "",
        label: value.label,
        icon: IconToKeyTransformer(value.icon),
        parameters: value.parameters,
        order: value.order,
      })),
    });

    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors);
      return;
    }
    setErrors({});
    const response = await createTestCaseAction(result.data);
    if (response.status === 200) {
      toast({
        title: "Success",
        description: "Test case created successfully",
        variant: "default",
      });
      router.push(`/test-cases`);
    }
    if (response.status === 500) {
      toast({
        title: "Error",
        description: response.error || "An error occurred",
        variant: "destructive",
      });
    }
  }, [description, nodesOrder, selectedTestSuites, title, router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 mb-4">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" value={title} onChange={onTitleChange} />
        <ErrorMessage
          message={errors.title?.[0] || ""}
          visible={!!errors.title}
        />
      </div>
      <div className="flex flex-col gap-2 mb-4">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          value={description}
          onChange={onDescriptionChange}
        />
        <ErrorMessage
          message={errors.description?.[0] || ""}
          visible={!!errors.description}
        />
      </div>
      <div className="flex flex-col gap-2 mb-4">
        <Label htmlFor="test-suites">Test Suites</Label>
        <MultiSelect
          options={testSuites.map((testSuite) => {
            return {
              label: testSuite.name,
              value: testSuite.id,
            };
          })}
          selected={selectedTestSuites}
          onChange={onTestSuiteChange}
        />
        <ErrorMessage
          message={errors.testSuiteIds?.[0] || ""}
          visible={!!errors.testSuiteIds}
        />
      </div>
      <div className="flex flex-col gap-2 mb-4 h-[500px]">
        <Label htmlFor="test-case-flow">Test Case Flow</Label>
        <TestCaseFlow
          initialNodesOrder={nodesOrder}
          templateStepParams={templateStepParams}
          templateSteps={templateSteps}
          onNodeOrderChange={onNodeOrderChange}
          locators={locators}
        />
      </div>
      <div className="flex flex-col gap-2 mb-4">
        <Button onClick={handleSubmit} className="w-fit px-6">
          Save
        </Button>
      </div>
    </div>
  );
};

export default TestCaseForm;
