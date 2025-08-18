import {
  getLocatorByIdAction,
  updateLocatorAction,
} from "@/actions/locator/locator-actions";
import { Locator, LocatorGroup } from "@prisma/client";
import React from "react";
import LocatorForm from "../../locator-form";
import { getAllLocatorGroupsAction } from "@/actions/locator-groups/locator-group-actions";

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

  const locator = data as Locator & { locatorGroup: LocatorGroup };

  const { data: locatorGroupList, error: locatorGroupListError } =
    await getAllLocatorGroupsAction();

  if (locatorGroupListError) {
    return <div>Error: {locatorGroupListError}</div>;
  }

  return (
    <LocatorForm
      defaultValues={{
        name: locator.name ?? "",
        value: locator.value ?? "",
        locatorGroupId: locator.locatorGroupId ?? "",
      }}
      successTitle="Locator updated"
      successMessage="Locator updated successfully"
      onSubmitAction={updateLocatorAction}
      id={id}
      locatorGroupList={locatorGroupList as LocatorGroup[]}
    />
  );
};

export default ModifyLocator;
