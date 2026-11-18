import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOrganization } from "../organizations/authorization.server";
import { requireAuth } from "../supabase/auth.server";
import { confirmTravelportPrice } from "./travelport-price.server";

export const confirmFlightPriceServer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      checkoutToken: z.string().min(1).max(2048),
      organizationId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const scope =
      data.organizationId === undefined
        ? { userId: (await requireAuth()).id }
        : await requireOrganization(data.organizationId);
    return confirmTravelportPrice(data.checkoutToken, scope);
  });
