import { WorkspaceSection } from "@/components/common/workspace-section";
import { LocalizedDateInput } from "@/components/flights/localized-date-input";
import { useLanguage } from "@/lib/i18n/language-context";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { Info, LoaderCircle, Search } from "lucide-react";
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
import { TestBookingStatusDialog } from "@/components/flights/test-booking-status-dialog";
import { FlightPriceDialog } from "@/components/flights/flight-price-dialog";
import { FlightItinerary, formatFlightDuration } from "@/components/flights/flight-itinerary";
import { FlightDateTime } from "@/components/flights/flight-date-time";
import { ComparablePrices } from "@/components/flights/comparable-prices";
import { FlightShortlist, formatOfferBaggage } from "@/components/flights/flight-shortlist";

import { flightSearchSchema, type FlightSearchInput } from "@/lib/flights/search-schema";
import { aviasalesSearchLink } from "@/lib/flights/aviasales-search-link";
import {
  deleteShortlist,
  FLIGHT_SHORTLIST_LIMIT,
  readRecentSearches,
  readSavedShortlists,
  readSearchInputs,
  readSearchSnapshot,
  saveRecentSearch,
  saveSearchSnapshot,
  saveShortlist,
  searchInputsKey,
  searchParamsKey,
  updateShortlistHotel,
  type SavedShortlist,
  type ShortlistHotel,
} from "@/lib/flights/search-session";
import { searchFlightsServer } from "@/lib/flights/search.functions";
import { KZ_AIRPORTS } from "@/lib/flights/airports";
import {
  CABIN_CLASSES,
  CABIN_LABELS,
  type FlightOffer,
  type FlightSearchParams,
  type FlightSearchSnapshot,
} from "@/lib/flights/types";
import { connectionDuration } from "@/lib/flights/connection-duration";
import {
  organizationFailure,
  useOrganizationWorkspace,
  type OrganizationWorkspace,
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

function totalJourneyMinutes(offer: FlightOffer, roundTrip: boolean): number | undefined {
  const outbound = offer.outbound?.durationMinutes ??
    connectionDuration(
      offer.outbound?.segments[0]?.departureAt ?? offer.departureAt,
      offer.outbound?.segments.at(-1)?.arrivalAt ?? offer.arrivalAt,
    );
  if (!roundTrip) return outbound;
  const inbound = offer.inbound;
  const inboundStart = inbound?.segments[0];
  const inboundEnd = inbound?.segments.at(-1);
  const inboundMinutes = inbound?.durationMinutes ??
    (inboundStart && inboundEnd ? connectionDuration(inboundStart.departureAt, inboundEnd.arrivalAt) : undefined);
  if (outbound !== undefined && inboundMinutes !== undefined) return outbound + inboundMinutes;
}

function FlightOfferOverview({ offer, roundTrip }: { offer: FlightOffer; roundTrip: boolean }) {
  const language = useLanguage();
  const { t, number } = language;
  const minutes = totalJourneyMinutes(offer, roundTrip);
  const returnStops = offer.inbound?.segments.length ? offer.inbound.segments.length - 1 : undefined;
  const stopLabel = (stops: number) =>
    stops === 0
      ? t("Direct flight")
      : stops === 1
        ? t("1 stop")
        : t("{count} stops", { count: number(stops) });

  return (
    <div className="flight-offer-overview">
      <div className="flight-offer-route min-w-0">
        <h3 className="font-semibold">
          {offer.origin} {roundTrip ? "↔" : "→"} {offer.destination}
        </h3>
      </div>

      <div className="flight-offer-schedule min-w-0 text-sm">
        <p className="text-muted-foreground">
          {roundTrip && `${t("Outbound")}: `}
          {stopLabel(offer.stops)}
          {roundTrip && ` · ${t("Return")}: ${returnStops === undefined ? t("No data") : stopLabel(returnStops)}`}
          {" · "}
          {minutes === undefined
            ? t("Total journey duration unavailable")
            : formatFlightDuration(minutes, language)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("Checked baggage")} · {formatOfferBaggage(offer, "checked", language)}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("Cabin baggage")} · {formatOfferBaggage(offer, "cabin", language)}
        </p>
      </div>

      <p className="agency-price whitespace-nowrap text-lg font-bold tabular-nums">
        {number(offer.price.amount)} {offer.price.currency}
      </p>
    </div>
  );
}

function SearchPage() {
  const { t } = useLanguage();
  useEffect(() => {
    document.title = `${t("Flight Search")} — Flight Analytics`;
  }, [t]);
  const workspace = useOrganizationWorkspace();
  const { selectedOrganizationId } = workspace;
  const personalScope =
    workspace.status === "ready" &&
    workspace.memberships.length === 0 &&
    !workspace.error &&
    !workspace.authorizationError &&
    selectedOrganizationId === null;
  const canSearch = workspace.canSearch || personalScope;
  const storageKey = canSearch ? searchInputsKey(workspace.userId, selectedOrganizationId) : null;
  return (
    <SearchForm
      key={storageKey}
      workspace={workspace}
      personalScope={personalScope}
      storageKey={storageKey}
    />
  );
}

function SearchForm({
  workspace,
  personalScope,
  storageKey,
}: {
  workspace: OrganizationWorkspace;
  personalScope: boolean;
  storageKey: string | null;
}) {
  const language = useLanguage();
  const { t, message, number, date, dateTime } = language;
  const searchFlights = useServerFn(searchFlightsServer);
  const { selectedOrganizationId, version } = workspace;
  const canSearch = storageKey !== null;
  // Personal snapshots are restored only in the personal search form.
  const [personalSearch, setPersonalSearch] = useState<{
    version: number;
    snapshot: FlightSearchSnapshot;
  } | null>(() => {
    const snapshot = personalScope ? readSearchSnapshot(workspace.userId, null) : undefined;
    return snapshot ? { version, snapshot } : null;
  });
  const search = personalScope
    ? personalSearch?.version === version
      ? personalSearch.snapshot
      : null
    : workspace.search;
  const request = useRef(0);
  const originInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<FormValues>(() => readSearchInputs(storageKey) ?? initial);
  const [recentSearches, setRecentSearches] = useState(() =>
    canSearch && selectedOrganizationId
      ? readRecentSearches(workspace.userId, selectedOrganizationId)
      : [],
  );
  const agencyId = canSearch ? selectedOrganizationId : null;
  const [searchFormOpen, setSearchFormOpen] = useState<boolean>();
  const [savedShortlists, setSavedShortlists] = useState(() =>
    agencyId ? readSavedShortlists(workspace.userId, agencyId) : [],
  );
  const [openedShortlist, setOpenedShortlist] = useState<SavedShortlist>();
  const [shortlistMessage, setShortlistMessage] = useState<string>();
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shortlist, setShortlist] = useState<{ search: FlightSearchSnapshot; ids: string[] }>();

  const [draftHotel, setDraftHotel] = useState<{
    search: FlightSearchSnapshot;
    hotel: ShortlistHotel;
  }>();
  const hotel = draftHotel && draftHotel.search === search ? draftHotel.hotel : undefined;

  const offers = search?.offers ?? [];
  const shortlistedIds = shortlist?.search === search ? shortlist.ids : [];
  const shortlistedOffers = offers.filter((offer) => shortlistedIds.includes(offer.id));
  const fetchedAt = search?.fetchedAt ?? null;
  const formOpen = searchFormOpen ?? !search?.offers.length;
  const summary = formOpen ? undefined : search?.params;
  const aviasalesLink =
    search && offers.length > 0 ? aviasalesSearchLink(search.params) : undefined;
  const invalidateRequest = useCallback(() => {
    ++request.current;
  }, []);

  useEffect(() => {
    // Invalidate pending UI independently of whether the old request settles.
    // Its finally block must still never clear a newer request's pending state.
    invalidateRequest();
    setPending(false);
    setNotice(null);
    return invalidateRequest;
  }, [selectedOrganizationId, version, invalidateRequest]);


  function toggleShortlistedOffer(id: string) {
    if (!search || !selectedOrganizationId || !workspace.isCurrentScope()) return;
    setShortlist((previous) => {
      const ids = previous?.search === search ? previous.ids : [];
      if (ids.includes(id)) return { search, ids: ids.filter((selected) => selected !== id) };
      if (ids.length < FLIGHT_SHORTLIST_LIMIT) return { search, ids: [...ids, id] };
      return previous;
    });
  }

  function saveSelectedFlights() {
    if (!agencyId || !search || shortlistedOffers.length === 0 || !workspace.isCurrentScope()) {
      return false;
    }
    const entries = saveShortlist(workspace.userId, agencyId, {
      ...search,
      offers: shortlistedOffers,
      hotel,
    });
    if (entries) setSavedShortlists(entries);
    setShortlistMessage(entries ? "Shortlist saved." : "Could not save the shortlist.");
    return Boolean(entries);
  }

  function changeDraftHotel(nextHotel: ShortlistHotel | undefined) {
    if (!search || !agencyId || !workspace.isCurrentScope()) return false;
    setDraftHotel(nextHotel ? { search, hotel: nextHotel } : undefined);
    return true;
  }

  function changeSavedHotel(nextHotel: ShortlistHotel | undefined) {
    if (!agencyId || !openedShortlist || !workspace.isCurrentScope()) return false;
    const updated = updateShortlistHotel(workspace.userId, agencyId, openedShortlist.id, nextHotel);
    if (!updated) return false;
    setOpenedShortlist(updated);
    setSavedShortlists((entries) =>
      entries.map((entry) => (entry.id === updated.id ? updated : entry)),
    );
    return true;
  }

  function removeSavedShortlist(id: string) {
    if (!agencyId || !workspace.isCurrentScope()) return;
    const entries = deleteShortlist(workspace.userId, agencyId, id);
    if (entries) setSavedShortlists(entries);
    setShortlistMessage(entries ? "Shortlist deleted." : "Could not delete the shortlist.");
  }

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void runSearch(values);
  }

  async function runSearch(input: FormValues) {
    if (pending || !storageKey) {
      return;
    }

    setNotice(null);

    // Validate the search form before calling the API.
    const parsed = flightSearchSchema.safeParse(input);

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

    const params: FlightSearchParams = {
      ...parsed.data,
      returnDate: parsed.data.returnDate || undefined,
    };
    setErrors({});
    setSearchFormOpen(true);
    setPending(true);
    if (selectedOrganizationId) workspace.clearSearch();
    setPersonalSearch(null);
    const currentRequest = ++request.current;
    const isCurrent = () => request.current === currentRequest && workspace.isCurrentScope();

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
        const snapshot = {
          params,
          offers: result.offers,
          fetchedAt: result.fetchedAt,
          ...(result.environment && { environment: result.environment }),
        };
        saveSearchSnapshot(workspace.userId, selectedOrganizationId, snapshot);
        setSearchFormOpen(result.offers.length === 0);
        if (selectedOrganizationId) {
          setRecentSearches(saveRecentSearch(workspace.userId, selectedOrganizationId, params));
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
    <div className={agencyId ? "flight-search agency-search" : "flight-search"}>
      <div className={summary ? "sr-only" : "agency-search-heading"}>
        <PageHeader title={t("Flight search")} />
      </div>

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

      <WorkspaceSection
        title={summary ? "Edit search" : "Search details"}
        label="Search details"
        className={summary ? "flight-search-panel flight-search-panel-compact" : "flight-search-panel"}
        open={formOpen}
        onOpenChange={setSearchFormOpen}
        summary={summary && (
          <>
            <strong className="text-foreground">{summary.origin} → {summary.destination}</strong>
            {" · "}{date(new Date(summary.departureDate), "UTC")}
            {summary.returnDate && ` – ${date(new Date(summary.returnDate), "UTC")}`}
            {" · "}{t("Passengers: {count}", { count: number(summary.passengers) })}
            {" · "}{t(CABIN_LABELS[summary.cabinClass])}
          </>
        )}
        keepMounted
      >
        <form
          onSubmit={onSubmit}
          noValidate
          className="flight-search-form grid items-start gap-3"
          aria-busy={pending}
        >
          <Field id="origin" label={t("Origin")} error={errors.origin}>
            <Input
              id="origin"
              ref={originInput}
              list="kz-airports"
              placeholder="ALA"
              maxLength={3}
              value={values.origin}
              onChange={(event) => set("origin", event.target.value.toUpperCase())}
              aria-invalid={!!errors.origin}
              aria-describedby={errors.origin ? "origin-error" : undefined}
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
              aria-describedby={errors.destination ? "destination-error" : undefined}
            />
          </Field>

          <Field id="departureDate" label={t("Departure date")} error={errors.departureDate}>
            <LocalizedDateInput
              id="departureDate"
              label={t("Departure date")}
              value={values.departureDate}
              onChange={(value) => set("departureDate", value)}
              invalid={!!errors.departureDate}
              describedBy={errors.departureDate ? "departureDate-error" : undefined}
            />
          </Field>

          <Field id="returnDate" label={t("Return date (optional)")} error={errors.returnDate}>
            <LocalizedDateInput
              id="returnDate"
              label={t("Return date (optional)")}
              value={values.returnDate ?? ""}
              onChange={(value) => set("returnDate", value)}
              invalid={!!errors.returnDate}
              describedBy={errors.returnDate ? "returnDate-error" : undefined}
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
              aria-describedby={errors.passengers ? "passengers-error" : undefined}
            />
          </Field>

          <Field id="cabinClass" label={t("Cabin class")} error={errors.cabinClass}>
            <Select
              value={values.cabinClass}
              onValueChange={(value) => set("cabinClass", value as FlightSearchInput["cabinClass"])}
            >
              <SelectTrigger
                id="cabinClass"
                aria-invalid={!!errors.cabinClass}
                aria-describedby={errors.cabinClass ? "cabinClass-error" : undefined}
              >
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

          <div className="flight-search-submit">
            <Button
              type="submit"
              className="w-full md:w-auto"
              disabled={pending || !canSearch}
              aria-describedby={!canSearch ? "search-organization-status" : undefined}
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Search aria-hidden="true" />
              )}
              {t(pending ? "Checking…" : "Search flights")}
            </Button>
          </div>
        </form>
        {recentSearches.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <h3 className="text-sm font-medium">{t("Recent searches on this browser")}</h3>
            <ul className="flex flex-wrap gap-2">
              {recentSearches.map((params) => (
                <li key={searchParamsKey(params)} className="max-w-full">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-8 max-w-full whitespace-normal text-left"
                    disabled={pending}
                    onClick={() => {
                      setValues(params);
                      setErrors({});
                      setNotice(null);
                      originInput.current?.focus();
                    }}
                  >
                    {params.origin} → {params.destination} ·{" "}
                    {date(new Date(params.departureDate), "UTC")}
                    {params.returnDate && ` – ${date(new Date(params.returnDate), "UTC")}`} ·{" "}
                    {t("Passengers")} {number(params.passengers)} ·{" "}
                    {t(CABIN_LABELS[params.cabinClass])}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </WorkspaceSection>

      <p role="status" className="sr-only">{pending ? t("Checking…") : ""}</p>

      {notice && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-lg border border-destructive/35 bg-card p-4 text-sm"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" />

          <div>
            <p className="font-medium">{t("Flight search unavailable")}</p>

            <p className="mt-0.5">{message(notice)}</p>
          </div>
        </div>
      )}

      {fetchedAt && (
        <section aria-label={t("Search results")} className="mt-5 space-y-4">
          <div className="agency-results-layout">
            <WorkspaceSection
              className="agency-results"
              contentClassName="flight-search-results-content"
              title={t("Flight offers ({count})", { count: number(offers.length) })}
            >
              <p className="text-sm text-muted-foreground">
                {t("Retrieved: {date}", { date: dateTime(fetchedAt) })}
              </p>
              {aviasalesLink && (
                <Button asChild variant="outline">
                  <a href={aviasalesLink} target="_blank" rel="noopener noreferrer">
                    {t("Search on Aviasales")}
                  </a>
                </Button>
              )}
              {offers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("No flights found for the selected route and date.")}
                </p>
              ) : (
                <div className="grid gap-3">
                  {offers.map((offer, index) => (
                    <Card key={offer.id} className="agency-offer">
                      <CardContent className="agency-offer-body">
                        <FlightOfferOverview
                          offer={offer}
                          roundTrip={Boolean(search?.params.returnDate || offer.inbound)}
                        />

                        <details className="flight-offer-details">
                          <summary className="cursor-pointer rounded-sm text-sm font-medium text-primary">
                            {t("Flight details")}
                          </summary>
                          <div className="mt-2 space-y-2">
                            <p className="text-sm font-medium">{offer.carrier} · {offer.flightNumber}</p>
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
                          </div>
                        </details>
                        {selectedOrganizationId && (
                          <label className="agency-offer-check flex w-fit cursor-pointer items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={shortlistedIds.includes(offer.id)}
                              disabled={
                                shortlistedIds.length >= FLIGHT_SHORTLIST_LIMIT &&
                                !shortlistedIds.includes(offer.id)
                              }
                              onChange={() => toggleShortlistedOffer(offer.id)}
                              aria-label={t("Include {flight} in the shortlist", {
                                flight: `${offer.carrier} ${offer.flightNumber}`,
                              })}
                              className="size-4 accent-primary"
                            />
                            <span>{t("Include in shortlist")}</span>
                          </label>
                        )}
                        <div className="agency-offer-tools flex flex-wrap gap-2 empty:hidden">
                          {search &&
                            !search.params.returnDate &&
                            offer.stops === 0 &&
                            offer.checkoutToken &&
                            !offers
                              .slice(0, index)
                              .some(
                                (previous) =>
                                  previous.checkoutToken &&
                                  previous.stops === 0 &&
                                  previous.carrier === offer.carrier &&
                                  previous.flightNumber === offer.flightNumber,
                              ) && (
                              <TestBookingStatusDialog
                                flight={{
                                  carrier: offer.carrier,
                                  flightNumber: offer.flightNumber,
                                  from: offer.origin,
                                  to: offer.destination,
                                  departureDate: search.params.departureDate,
                                }}
                                organizationId={selectedOrganizationId}
                              />
                            )}
                          {offer.checkoutToken && search && (
                            <FlightPriceDialog
                              key={offer.checkoutToken}
                              offer={offer}
                              checkoutToken={offer.checkoutToken}
                              organizationId={selectedOrganizationId}
                              refresh={() => {
                                setValues(search.params);
                                void runSearch(search.params);
                              }}
                            />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </WorkspaceSection>
            {search && selectedOrganizationId && offers.length > 0 && (
              <FlightShortlist
                search={search}
                offers={shortlistedOffers}
                hotel={hotel}
                onHotelChange={changeDraftHotel}
                onRemove={toggleShortlistedOffer}
                onSave={saveSelectedFlights}
              />
            )}
          </div>
          {search && <ComparablePrices search={search} collapsible />}
        </section>
      )}

      {agencyId && (
        <WorkspaceSection title={t("Saved shortlists")} className="agency-saved-shortlists mt-5">
          {savedShortlists.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No saved shortlists yet.")}</p>
          ) : (
            <ul className="space-y-2">
              {savedShortlists.map((entry) => {
                const { origin, destination, departureDate } = entry.params;
                const label = `${origin} → ${destination} · ${date(new Date(departureDate), "UTC")}`;
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("Options: {count}", { count: number(entry.offers.length) })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={t("Open shortlist for {route}", { route: label })}
                        onClick={() => {
                          if (workspace.isCurrentScope()) setOpenedShortlist(entry);
                        }}
                      >
                        {t("Open shortlist")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={t("Delete shortlist for {route}", { route: label })}
                        onClick={() => removeSavedShortlist(entry.id)}
                      >
                        {t("Delete shortlist")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {shortlistMessage && (
            <p role="status" className="text-sm">
              {t(shortlistMessage)}
            </p>
          )}
          {openedShortlist && (
            <FlightShortlist
              key={openedShortlist.id}
              search={openedShortlist}
              offers={openedShortlist.offers}
              hotel={openedShortlist.hotel}
              onHotelChange={changeSavedHotel}
              onClose={() => setOpenedShortlist(undefined)}
            />
          )}
        </WorkspaceSection>
      )}
    </div>
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

      {error && <p id={`${id}-error`} className="text-xs text-destructive">{message(error)}</p>}
    </div>
  );
}
