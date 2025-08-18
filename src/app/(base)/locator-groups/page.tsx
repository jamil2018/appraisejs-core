import PageHeader from "@/components/typography/page-header";
import HeaderSubtitle from "@/components/typography/page-header-subtitle";
import React from "react";
import { Group } from "lucide-react";
import LocatorGroupTable from "./locator-group-table";

const LocatorGroups = () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Group className="w-8 h-8 mr-2" />
            Locator Groups
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Locator groups are used to group locators together. They are used to
          identify the elements on the page.
        </HeaderSubtitle>
      </div>
      <LocatorGroupTable />
    </>
  );
};

export default LocatorGroups;
