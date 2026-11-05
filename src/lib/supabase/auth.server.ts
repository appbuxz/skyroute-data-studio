import { setResponseStatus } from "@tanstack/react-start/server";
import { createSupabaseServerClient } from "./server";

export class UnauthorizedError extends Error {
  readonly statusCode = 401;

  constructor() {
    super("Authentication required");
    this.name = "UnauthorizedError";
  }
}

export async function requireAuth() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    setResponseStatus(401);
    throw new UnauthorizedError();
  }

  return data.user;
}
