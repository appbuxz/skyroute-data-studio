import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { flightSearchSchema } from "./search-schema";
import { flightData } from "./provider";
import type { FlightSearchResult } from "./types";

export const searchFlightsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(flightSearchSchema)
  .handler(async ({ data, context }): Promise<FlightSearchResult> => {
    const { data: identity, error } = await context.supabase.auth.getUser();
    if (error || !identity.user) throw new Error("Unauthorized");
    try {
      return await flightData.searchFlights({ ...data, returnDate: data.returnDate || undefined }, {});
    } catch (error) {
      console.error("Flight search failed:", error);
      return { status: "error", message: "Flight search is temporarily unavailable." };
    }
  });