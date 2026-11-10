import { setResponseStatus } from "@tanstack/react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { requireAuth, UnauthorizedError } from "./auth.server";
export const getAuthenticatedUser = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const user = await requireAuth();
    return { id: user.id };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      setResponseStatus(200);
      return null;
    }
    throw error;
  }
});
