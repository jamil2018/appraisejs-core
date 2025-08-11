import {
  getLocatorByIdAction,
  updateLocatorAction,
} from "@/actions/locator/locator-actions";
import { Locator, Module } from "@prisma/client";
import React from "react";
import LocatorForm from "../../locator-form";
import { getAllModulesAction } from "@/actions/modules/module-actions";

const ModifyLocator = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const { id } = await params;
  const { data, error } = await getLocatorByIdAction(id);

  if (error) {
    return <div>Error: {error}</div>;
  }

  const locator = data as Locator & { module: Module };

  const { data: moduleList, error: moduleListError } =
    await getAllModulesAction();

  if (moduleListError) {
    return <div>Error: {moduleListError}</div>;
  }

  return (
    <LocatorForm
      defaultValues={{
        name: locator.name ?? "",
        value: locator.value ?? "",
        moduleId: locator.moduleId ?? "",
      }}
      successTitle="Locator updated"
      successMessage="Locator updated successfully"
      onSubmitAction={updateLocatorAction}
      id={id}
      moduleList={moduleList as Module[]}
    />
  );
};

export default ModifyLocator;
