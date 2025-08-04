import PageHeader from "@/components/typography/page-header";
import HeaderSubtitle from "@/components/typography/page-header-subtitle";
import React from "react";

const CreateTestCaseFromTemplate = () => {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader>Create Test Case From Template</PageHeader>
      <HeaderSubtitle>
        Create a test case from a template. This will create a new test case
        with the same steps as the template.
      </HeaderSubtitle>
    </div>
  );
};

export default CreateTestCaseFromTemplate;
