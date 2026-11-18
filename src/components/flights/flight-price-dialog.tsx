import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { confirmFlightPriceServer } from "@/lib/flights/flight-price.functions";
import type { FlightOffer, FlightPriceConfirmation, OrganizationId } from "@/lib/flights/types";
import { useLanguage } from "@/lib/i18n/language-context";

export function FlightPriceDialog({
  offer,
  checkoutToken,
  organizationId,
  refresh,
}: {
  offer: FlightOffer;
  checkoutToken: string;
  organizationId: OrganizationId | null;
  refresh: () => void;
}) {
  const { t, number } = useLanguage();
  const confirmPrice = useServerFn(confirmFlightPriceServer);
  const [result, setResult] = useState<FlightPriceConfirmation | null>(null);
  const request = useRef(0);

  async function onOpenChange(open: boolean) {
    const current = ++request.current;
    if (!open) return;
    setResult(null);
    try {
      const response = await confirmPrice({
        data: { checkoutToken, ...(organizationId ? { organizationId } : {}) },
      });
      if (request.current === current) setResult(response);
    } catch {
      if (request.current === current) setResult({ status: "error" });
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {t("Select flight")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {offer.origin} → {offer.destination}
          </DialogTitle>
          <DialogDescription>{t("Test price check · Travelport pre-production")}</DialogDescription>
        </DialogHeader>
        <p>
          {offer.carrier} · {offer.flightNumber}
        </p>
        <dl className="grid grid-cols-2 gap-2">
          <dt>{t("Search price")}</dt>
          <dd>
            {number(offer.price.amount)} {offer.price.currency}
          </dd>
          {result && "price" in result && (
            <>
              <dt>{t("Confirmed price")}</dt>
              <dd>
                {number(result.price.amount)} {result.price.currency}
              </dd>
            </>
          )}
        </dl>
        <div role="status" className="text-sm">
          {!result && t("Confirming the price…")}
          {result?.status === "changed" && t("The price changed since the search.")}
          {result?.status === "unavailable" && t("This fare is no longer available.")}
          {result?.status === "expired" && t("This offer has expired. Refresh your search.")}
          {result?.status === "error" && t("Unable to confirm this price. Try again.")}
        </div>
        {result?.status === "expired" && (
          <Button type="button" onClick={refresh}>
            {t("Refresh search")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
