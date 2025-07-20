import PageHeader from "@/components/typography/page-header";
import { Blocks } from "lucide-react";
import React from "react";

const ModifyTemplateTestCase = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const { id } = await params;

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Blocks className="w-8 h-8 mr-2" />
            Modify Template Test Case {id}
          </span>
        </PageHeader>
      </div>
    </>
  );
};

export default ModifyTemplateTestCase;
