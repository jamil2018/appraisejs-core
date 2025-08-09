import PageHeader from "@/components/typography/page-header";
import HeaderSubtitle from "@/components/typography/page-header-subtitle";
import React from "react";
import { Code } from "lucide-react";
import ModuleTable from "./module-table";

const Modules = () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Code className="w-8 h-8 mr-2" />
            Modules
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Modules are the components that are used to build the application
        </HeaderSubtitle>
      </div>
      <ModuleTable />
    </>
  );
};

export default Modules;
