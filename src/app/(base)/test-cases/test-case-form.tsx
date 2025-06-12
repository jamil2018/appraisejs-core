"use client";
import React, { useCallback, useState } from "react";
import TestCaseFlow from "./test-case-flow";
import { NodeOrderMap } from "@/types/diagram/diagram";
import {
  Locator,
  TemplateStep,
  TemplateStepParameter,
  TestSuite,
} from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
import { Button } from "@/components/ui/button";

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
  // states
  const [nodesOrder, setNodesOrder] = useState<NodeOrderMap>(defaultNodesOrder);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [selectedTestSuites, setSelectedTestSuites] = useState<string[]>([]);

  // handlers
  const onNodeOrderChange = useCallback((nodesOrder: NodeOrderMap) => {
    setNodesOrder(nodesOrder);
  }, []);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(title, description, selectedTestSuites, nodesOrder);
    },
    [description, nodesOrder, selectedTestSuites, title]
  );

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

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="flex flex-col gap-2 mb-4">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" value={title} onChange={onTitleChange} />
      </div>
      <div className="flex flex-col gap-2 mb-4">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          value={description}
          onChange={onDescriptionChange}
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
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
};

export default TestCaseForm;
