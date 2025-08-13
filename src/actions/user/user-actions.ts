// User actions removed since authentication system was removed
// This file is kept for potential future use but all user-related functionality is disabled

import { ActionResponse } from "@/types/form/actionHandler";

export async function getAllUsersAction(): Promise<ActionResponse> {
  // Since User model was removed, return empty array
  return {
    status: 200,
    data: [],
    message: "No users available - authentication system removed",
  };
}