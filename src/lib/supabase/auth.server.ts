import { setResponseStatus } from "@tanstack/react-start/server";
import { createSupabaseServerClient } from "./server";
export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor() {
    super("Authentication required");
    this.name = "UnauthorizedError";
  }
}
/** Verify bearer identity against Auth; never trust browser claims or token shape alone. */
export async function requireAuth() {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new UnauthorizedError();
    return data.user;
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error as { statusCode?: number })?.statusCode === 401
    ) {
      setResponseStatus(401);
      throw new UnauthorizedError();
    }
    setResponseStatus(503);
    throw Object.assign(new Error("Authentication service unavailable"), { statusCode: 503 });
  }
}
