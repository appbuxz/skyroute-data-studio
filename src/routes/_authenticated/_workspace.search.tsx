import { WorkspaceSection } from "@/components/common/workspace-section";
import { LocalizedDateInput } from "@/components/flights/localized-date-input";
import { useLanguage } from "@/lib/i18n/language-context";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/common/page-header";
import { FlightItinerary } from "@/components/flights/flight-itinerary";
import { FlightDateTime } from "@/components/flights/flight-date-time";
import { ComparablePrices } from "@/components/flights/comparable-prices";

import { flightSearchSchema, type FlightSearchInput } from "@/lib/flights/search-schema";
import { searchFlightsServer } from "@/lib/flights/search.functions";
import { KZ_AIRPORTS } from "@/lib/flights/airports";
import {
  CABIN_CLASSES,
  CABIN_LABELS,
  type FlightSearchParams,
  type FlightSearchSnapshot,
} from "@/lib/flights/types";
import { analyzeFlightPrices } from "@/lib/flights/analytics";
import {
  organizationFailure,
  useOrganizationWorkspace,
} from "@/lib/organizations/workspace-context";

export const Route = createFileRoute("/_authenticated/_workspace/search")({
  head: () => ({
    meta: [
      { title: "Flight Search — Flight Analytics" },
      {
        name: "description",
        content: "Search routes by origin, destination, dates, passengers and cabin class.",
      },
      {
        property: "og:title",
        content: "Flight Search — Flight Analytics",
      },
      {
        property: "og:description",
        content: "Search routes by origin, destination, dates, passengers and cabin class.",
      },
    ],
  }),
  component: SearchPage,
});

type FormValues = Omit<FlightSearchInput, "passengers"> & {
  passengers: string | number;
};

type Errors = Partial<Record<keyof FormValues, string>>;

const initial: FormValues = {
  origin: "",
  destination: "",
  departureDate: "",
  returnDate: "",
  passengers: 1,
  cabinClass: "economy",
};

function SearchPage() {
  const { t, message, number, dateTime } = useLanguage();
  useEffect(() => {
    document.title = `${t("Flight Search")} — Flight Analytics`;
  }, [t]);
  const searchFlights = useServerFn(searchFlightsServer);
  const workspace = useOrganizationWorkspace();
  const { selectedOrganizationId, version } = workspace;
  const personalScope =
    workspace.status === "ready" &&
    workspace.memberships.length === 0 &&
    !workspace.error &&
    !workspace.authorizationError &&
    selectedOrganizationId === null;
  const canSearch = workspace.canSearch || personalScope;
  // Personal snapshots stay on this page, never in the agency workspace or storage.
  const [personalSearch, setPersonalSearch] = useState<{
    version: number;
    snapshot: FlightSearchSnapshot;
  } | null>(null);
  const search = personalScope
    ? personalSearch?.version === version
      ? personalSearch.snapshot
      : null
    : workspace.search;
  const request = useRef(0);
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const offers = search?.offers ?? [];
  const fetchedAt = search?.fetchedAt ?? null;
  const invalidateRequest = useCallback(() => {
    ++request.current;
  }, []);

  useEffect(() => {
    // Invalidate pending UI independently of whether the old request settles.
    // Its finally block must still never clear a newer request's pending state.
    invalidateRequest();
    setPending(false);
    setNotice(null);
    setPersonalSearch(null);
    return invalidateRequest;
  }, [selectedOrganizationId, version, invalidateRequest]);

  const priceAnalysis = analyzeFlightPrices(offers);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (pending || !canSearch) {
      return;
    }

    setNotice(null);

    // Validate the search form before calling the API.
    const parsed = flightSearchSchema.safeParse(values);

    if (!parsed.success) {
      const nextErrors: Errors = {};

      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormValues;

        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }

      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setPending(true);
    if (selectedOrganizationId) workspace.clearSearch();
    setPersonalSearch(null);
    const currentRequest = ++request.current;
    const isCurrent = () => request.current === currentRequest && workspace.isCurrentScope();

    const params: FlightSearchParams = {
      ...parsed.data,
      returnDate: parsed.data.returnDate || undefined,
    };

    try {
      // Omit organization context for a personal search; the server verifies identity.
      const result = await searchFlights({
        data: {
          ...params,
          ...(selectedOrganizationId ? { organizationId: selectedOrganizationId } : {}),
        },
      });
      if (!isCurrent()) return;

      if (result.status === "ok") {
        const snapshot = { params, offers: result.offers, fetchedAt: result.fetchedAt };
        if (selectedOrganizationId) {
          workspace.publishSearch({ ...snapshot, organizationId: selectedOrganizationId });
        } else {
          setPersonalSearch({ version, snapshot });
        }
      } else {
        setNotice(result.message);
      }
    } catch (error) {
      if (!isCurrent()) return;
      const failure = organizationFailure(error);
      if (failure?.blockSelection) {
        setPending(false);
        workspace.rejectSelection(failure.message);
      } else {
        setNotice(
          failure?.message ?? "Unable to complete the flight search request. Please try again.",
        );
      }
    } finally {
      if (isCurrent()) setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("Flight search")}
        description={t(
          "Search and compare flights, fares and schedules for free. Sign in to search; no organization is required. Enter IATA airport codes, e.g. ALA or NQZ.",
        )}
      />

      {!canSearch && (
        <p
          id="search-organization-status"
          role="status"
          className="mb-4 text-sm text-muted-foreground"
        >
          {workspace.status === "loading"
            ? t("Loading organizations…")
            : ((workspace.error ? message(workspace.error) : null) ??
              (workspace.authorizationError ? message(workspace.authorizationError) : null) ??
              (workspace.memberships.length === 0
                ? t("No organization assigned. Ask your agency owner to arrange access.")
                : t("Select an organization before searching.")))}
        </p>
      )}

      <WorkspaceSection title="Search details" className="shadow-card" keepMounted>
        <form
          onSubmit={onSubmit}
          noValidate
          className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3"
        >
          <Field id="origin" label={t("Origin")} error={errors.origin}>
            <Input
              id="origin"
              list="kz-airports"
              placeholder="ALA"
              maxLength={3}
              value={values.origin}
              onChange={(event) => set("origin", event.target.value.toUpperCase())}
              aria-invalid={!!errors.origin}
            />
          </Field>

          <Field id="destination" label={t("Destination")} error={errors.destination}>
            <Input
              id="destination"
              list="kz-airports"
              placeholder="IST"
              maxLength={3}
              value={values.destination}
              onChange={(event) => set("destination", event.target.value.toUpperCase())}
              aria-invalid={!!errors.destination}
            />
          </Field>

          <Field id="passengers" label={t("Passengers")} error={errors.passengers}>
            <Input
              id="passengers"
              type="number"
              min={1}
              max={9}
              value={String(values.passengers ?? "")}
              onChange={(event) => set("passengers", event.target.value)}
              aria-invalid={!!errors.passengers}
            />
          </Field>

          <Field id="departureDate" label={t("Departure date")} error={errors.departureDate}>
            <LocalizedDateInput
              id="departureDate"
              label={t("Departure date")}
              value={values.departureDate}
              onChange={(value) => set("departureDate", value)}
              invalid={!!errors.departureDate}
            />
          </Field>

          <Field id="returnDate" label={t("Return date (optional)")} error={errors.returnDate}>
            <LocalizedDateInput
              id="returnDate"
              label={t("Return date (optional)")}
              value={values.returnDate ?? ""}
              onChange={(value) => set("returnDate", value)}
              invalid={!!errors.returnDate}
            />
          </Field>

          <Field id="cabinClass" label={t("Cabin class")} error={errors.cabinClass}>
            <Select
              value={values.cabinClass}
              onValueChange={(value) => set("cabinClass", value as FlightSearchInput["cabinClass"])}
            >
              <SelectTrigger id="cabinClass">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {CABIN_CLASSES.map((cabinClass) => (
                  <SelectItem key={cabinClass} value={cabinClass}>
                    {t(CABIN_LABELS[cabinClass])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <datalist id="kz-airports">
            {KZ_AIRPORTS.map((airport) => (
              <option key={airport.iata} value={airport.iata}>
                {t(airport.city)} — {t(airport.name)}
              </option>
            ))}
          </datalist>

          <div className="md:col-span-2 lg:col-span-3">
            <Button
              type="submit"
              disabled={pending || !canSearch}
              aria-describedby={!canSearch ? "search-organization-status" : undefined}
            >
              {t(pending ? "Checking…" : "Search flights")}
            </Button>
          </div>
        </form>
      </WorkspaceSection>

      {notice && (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-lg border border-highlight/40 bg-accent p-4 text-sm text-accent-foreground"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" />

          <div>
            <p className="font-medium">{t("Flight search unavailable")}</p>

            <p className="mt-0.5">{message(notice)}</p>
          </div>
        </div>
      )}

      {fetchedAt && (
        <section className="mt-6 space-y-4">
          {priceAnalysis && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted-foreground">{t("Lowest price")}</p>

                  <p className="mt-2 text-2xl font-bold">
                    {number(priceAnalysis.cheapest.price.amount)} {priceAnalysis.currency}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted-foreground">{t("Average price")}</p>

                  <p className="mt-2 text-2xl font-bold">
                    {number(Math.round(priceAnalysis.averagePrice))} {priceAnalysis.currency}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted-foreground">{t("Price spread")}</p>

                  <p className="mt-2 text-2xl font-bold">
                    {number(priceAnalysis.priceSpread)} {priceAnalysis.currency}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("{percent}% between highest and lowest fares", {
                      percent: number(priceAnalysis.priceSpreadPercent, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      }),
                    })}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {search && <ComparablePrices search={search} collapsible />}

          <WorkspaceSection title={t("Flight offers ({count})", { count: number(offers.length) })}>
            <p className="text-sm text-muted-foreground">
              {t("Retrieved: {date}", { date: dateTime(fetchedAt) })}
            </p>
            {offers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("No flights found for the selected route and date.")}
              </p>
            ) : (
              <div className="grid gap-3">
                {offers.map((offer) => (
                  <Card key={offer.id}>
                    <CardContent className="space-y-2 pt-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {offer.origin} → {offer.destination}
                          </p>

                          <p className="text-sm text-muted-foreground">
                            {offer.carrier} · {offer.flightNumber}
                          </p>
                        </div>

                        <p className="text-lg font-bold">
                          {number(offer.price.amount)} {offer.price.currency}
                        </p>
                      </div>

                      <p className="text-sm">
                        {offer.stops === 0
                          ? t("Direct flight")
                          : offer.stops === 1
                            ? t("1 stop")
                            : t("{count} stops", { count: number(offer.stops) })}
                      </p>

                      {offer.outbound?.segments.length ? (
                        <FlightItinerary itinerary={offer.outbound} label="Outbound itinerary" />
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">
                            {t("Departure:")} <FlightDateTime value={offer.departureAt} />
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t("Arrival:")} <FlightDateTime value={offer.arrivalAt} />
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t("Segment details unavailable")}
                          </p>
                        </>
                      )}
                      {offer.inbound?.segments.length ? (
                        <FlightItinerary itinerary={offer.inbound} label="Return itinerary" />
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </WorkspaceSection>
        </section>
      )}
    </>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  const { message } = useLanguage();
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>

      {children}

      {error && <p className="text-xs text-destructive">{message(error)}</p>}
    </div>
  );
}
