import PageHeader from "@/components/typography/page-header";
import { Blocks } from "lucide-react";
import React from "react";

const CreateTemplateTestCase = () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Blocks className="w-8 h-8 mr-2" />
            Create Template Test Case
          </span>
        </PageHeader>
      </div>
    </>
  );
};

export default CreateTemplateTestCase;
