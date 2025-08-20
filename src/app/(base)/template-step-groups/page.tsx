import PageHeader from "@/components/typography/page-header";
import HeaderSubtitle from "@/components/typography/page-header-subtitle";
import { Component } from "lucide-react";
import TemplateStepGroupTable from "./template-step-group-table";
import { Suspense } from "react";
import Loading from "../../../components/ui/loading";

const TemplateStepGroups = async () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Component className="w-8 h-8 mr-2" />
            Template Step Groups
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Template step groups organize related template steps for better
          management and reusability
        </HeaderSubtitle>
      </div>
      <Suspense fallback={<Loading />}>
        <TemplateStepGroupTable />
      </Suspense>
    </>
  );
};

export default TemplateStepGroups;
