
import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

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

import {
  flightSearchSchema,
  type FlightSearchInput,
} from "@/lib/flights/search-schema";
import { searchFlightsServer } from "@/lib/flights/search.server";
import { KZ_AIRPORTS } from "@/lib/flights/airports";
import {
  CABIN_CLASSES,
  CABIN_LABELS,
  type FlightOffer,
  type FlightSearchParams,
} from "@/lib/flights/types";
import { analyzeFlightPrices } from "@/lib/flights/analytics";
import { getAuthenticatedUser } from "@/lib/supabase/session.server";
import { saveFlightSearch } from "@/lib/flights/search-session";

export const Route = createFileRoute("/_workspace/search")({
  head: () => ({
    meta: [
      { title: "Flight Search — Flight Analytics" },
      {
        name: "description",
        content:
          "Search routes by origin, destination, dates, passengers and cabin class.",
      },
      {
        property: "og:title",
        content: "Flight Search — Flight Analytics",
      },
      {
        property: "og:description",
        content:
          "Search routes by origin, destination, dates, passengers and cabin class.",
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
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const priceAnalysis = analyzeFlightPrices(offers);

  const set = <K extends keyof FormValues>(
    key: K,
    value: FormValues[K],
  ) => {
    setValues((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (pending) {
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
    setOffers([]);
    setFetchedAt(null);

    const params: FlightSearchParams = {
      ...parsed.data,
      returnDate: parsed.data.returnDate || undefined,
    };

    try {
      // Execute the authenticated server-side flight search.
      const result = await searchFlightsServer({
        data: params,
      });

      if (result.status === "ok") {
        setOffers(result.offers);
        setFetchedAt(result.fetchedAt);

        // Session persistence must never break a successful search.
        try {
          const user = await getAuthenticatedUser();

          if (user?.id) {
            const saved = saveFlightSearch({
              userId: user.id,
              params,
              offers: result.offers,
              fetchedAt: result.fetchedAt,
            });

            if (!saved) {
              console.warn(
                "Flight search session could not be saved.",
              );
            }
          }
        } catch (sessionError) {
          console.warn(
            "Unable to save flight search session:",
            sessionError,
          );
        }
      } else {
        setNotice(result.message);
      }
    } catch (error) {
      console.error(
        "Flight search request failed:",
        error,
      );

      setNotice(
        "Unable to complete the flight search request.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Flight search"
        description="Define a route to analyse. Enter IATA airport codes, e.g. ALA or NQZ."
      />

      <Card className="shadow-card">
        <CardContent className="pt-6">
          <form
            onSubmit={onSubmit}
            noValidate
            className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3"
          >
            <Field
              id="origin"
              label="Origin"
              error={errors.origin}
            >
              <Input
                id="origin"
                list="kz-airports"
                placeholder="ALA"
                maxLength={3}
                value={values.origin}
                onChange={(event) =>
                  set(
                    "origin",
                    event.target.value.toUpperCase(),
                  )
                }
                aria-invalid={!!errors.origin}
              />
            </Field>

            <Field
              id="destination"
              label="Destination"
              error={errors.destination}
            >
              <Input
                id="destination"
                list="kz-airports"
                placeholder="IST"
                maxLength={3}
                value={values.destination}
                onChange={(event) =>
                  set(
                    "destination",
                    event.target.value.toUpperCase(),
                  )
                }
                aria-invalid={!!errors.destination}
              />
            </Field>

            <Field
              id="passengers"
              label="Passengers"
              error={errors.passengers}
            >
              <Input
                id="passengers"
                type="number"
                min={1}
                max={9}
                value={String(values.passengers ?? "")}
                onChange={(event) =>
                  set("passengers", event.target.value)
                }
                aria-invalid={!!errors.passengers}
              />
            </Field>

            <Field
              id="departureDate"
              label="Departure date"
              error={errors.departureDate}
            >
              <Input
                id="departureDate"
                type="date"
                value={values.departureDate}
                onChange={(event) =>
                  set(
                    "departureDate",
                    event.target.value,
                  )
                }
                aria-invalid={!!errors.departureDate}
              />
            </Field>

            <Field
              id="returnDate"
              label="Return date (optional)"
              error={errors.returnDate}
            >
              <Input
                id="returnDate"
                type="date"
                value={values.returnDate}
                onChange={(event) =>
                  set("returnDate", event.target.value)
                }
                aria-invalid={!!errors.returnDate}
              />
            </Field>

            <Field
              id="cabinClass"
              label="Cabin class"
              error={errors.cabinClass}
            >
              <Select
                value={values.cabinClass}
                onValueChange={(value) =>
                  set(
                    "cabinClass",
                    value as FlightSearchInput["cabinClass"],
                  )
                }
              >
                <SelectTrigger id="cabinClass">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {CABIN_CLASSES.map((cabinClass) => (
                    <SelectItem
                      key={cabinClass}
                      value={cabinClass}
                    >
                      {CABIN_LABELS[cabinClass]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <datalist id="kz-airports">
              {KZ_AIRPORTS.map((airport) => (
                <option
                  key={airport.iata}
                  value={airport.iata}
                >
                  {airport.city} — {airport.name}
                </option>
              ))}
            </datalist>

            <div className="md:col-span-2 lg:col-span-3">
              <Button
                type="submit"
                disabled={pending}
              >
                {pending
                  ? "Checking…"
                  : "Search flights"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {notice && (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-lg border border-highlight/40 bg-accent p-4 text-sm text-accent-foreground"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" />

          <div>
            <p className="font-medium">
              Flight search unavailable
            </p>

            <p className="mt-0.5">
              {notice}
            </p>
          </div>
        </div>
      )}

      {fetchedAt && (
        <section className="mt-6 space-y-4">
          {priceAnalysis && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted-foreground">
                    Lowest price
                  </p>

                  <p className="mt-2 text-2xl font-bold">
                    {priceAnalysis.cheapest.price.amount.toLocaleString()}{" "}
                    {priceAnalysis.currency}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted-foreground">
                    Average price
                  </p>

                  <p className="mt-2 text-2xl font-bold">
                    {Math.round(
                      priceAnalysis.averagePrice,
                    ).toLocaleString()}{" "}
                    {priceAnalysis.currency}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted-foreground">
                    Price spread
                  </p>

                  <p className="mt-2 text-2xl font-bold">
                    {priceAnalysis.priceSpread.toLocaleString()}{" "}
                    {priceAnalysis.currency}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {priceAnalysis.priceSpreadPercent.toFixed(1)}%
                    {" "}between highest and lowest fares
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <div>
            <h2 className="text-xl font-semibold">
              Flight offers ({offers.length})
            </h2>

            <p className="text-sm text-muted-foreground">
              Retrieved:{" "}
              {new Date(fetchedAt).toLocaleString()}
            </p>
          </div>

          {offers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No flights found for the selected route and date.
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
                        {offer.price.amount.toLocaleString()}{" "}
                        {offer.price.currency}
                      </p>
                    </div>

                    <p className="text-sm">
                      {offer.stops === 0
                        ? "Direct flight"
                        : `${offer.stops} stop${
                            offer.stops === 1 ? "" : "s"
                          }`}
                    </p>

                    <p className="text-sm text-muted-foreground">
                      Departure: {offer.departureAt}
                    </p>

                    <p className="text-sm text-muted-foreground">
                      Arrival: {offer.arrivalAt}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>
        {label}
      </Label>

      {children}

      {error && (
        <p className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
