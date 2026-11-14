import { WorkspaceSection } from "@/components/common/workspace-section";
import type { ZodIssue } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Loader2, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KZ_AIRPORTS } from "@/lib/flights/airports";
import { flightCheckSchema, type FlightCheckResult } from "@/lib/flights/flight-check";
import { checkFlightServer } from "@/lib/flights/flight-check.functions";
import { CABIN_CLASSES, CABIN_LABELS, type CabinClass } from "@/lib/flights/types";
import {
  organizationFailure,
  useOrganizationWorkspace,
} from "@/lib/organizations/workspace-context";
import { FlightCheckResults } from "./flight-check-results";

const selectStyle =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
type BaggageValues = { status: "" | "not_required" | "required"; pieces: string; weightKg: string };
const emptyBaggage: BaggageValues = { status: "", pieces: "", weightKg: "" };
const initial = {
  origin: "",
  destination: "",
  departureDate: "",
  passengers: "1",
  cabinClass: "economy" as CabinClass,
  originalPrice: "",
  originalCurrency: "",
  checked: emptyBaggage,
  cabin: emptyBaggage,
};

export function CheckMyFlightPage() {
  const checkFlight = useServerFn(checkFlightServer);
  const workspace = useOrganizationWorkspace();
  const { selectedOrganizationId, version, canSearch } = workspace;
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState<{
    result: FlightCheckResult;
    organizationId: string;
    version: number;
  } | null>(null);
  const request = useRef(0);
  const inFlight = useRef(false);

  const invalidateRequest = useCallback(() => {
    ++request.current;
  }, []);

  useEffect(() => {
    invalidateRequest();
    inFlight.current = false;
    setPending(false);
    setNotice(null);
    setCompleted(null);
    return invalidateRequest;
  }, [selectedOrganizationId, version, invalidateRequest]);

  function set<K extends keyof typeof initial>(key: K, value: (typeof initial)[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setCompleted(null);
    setNotice(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !canSearch || !selectedOrganizationId) return;
    const baggage = (value: BaggageValues) =>
      value.status === "required"
        ? {
            status: value.status,
            pieces: value.pieces === "" ? NaN : Number(value.pieces),
            ...(value.weightKg === "" ? {} : { weightKg: Number(value.weightKg) }),
          }
        : { status: value.status };
    const parsed = flightCheckSchema.safeParse({
      origin: values.origin,
      destination: values.destination,
      departureDate: values.departureDate,
      passengers: values.passengers,
      cabinClass: values.cabinClass,
      originalPrice: values.originalPrice === "" ? NaN : Number(values.originalPrice),
      originalCurrency: values.originalCurrency,
      tripType: "one_way",
      mode: "requirements_match",
      baggageRequirements: { checked: baggage(values.checked), cabin: baggage(values.cabin) },
    });
    setNotice(null);
    setCompleted(null);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      const collect = (issues: ZodIssue[]) => {
        for (const issue of issues) {
          if (issue.code === "invalid_union")
            issue.unionErrors.forEach((error) => collect(error.issues));
          else next[issue.path.join(".")] ??= issue.message;
        }
      };
      collect(parsed.error.issues);
      // The schema's union may report a parent-level issue for an unselected requirement.
      for (const kind of ["checked", "cabin"] as const) {
        if (!values[kind].status)
          next[`baggageRequirements.${kind}.status`] = "Choose whether this baggage is required.";
      }
      setErrors(next);
      return;
    }
    setErrors({});
    inFlight.current = true;
    setPending(true);
    const current = ++request.current;
    const isCurrent = () => request.current === current && workspace.isCurrentScope();
    try {
      const result = await checkFlight({
        data: { ...parsed.data, organizationId: selectedOrganizationId },
      });
      if (isCurrent()) setCompleted({ result, organizationId: selectedOrganizationId, version });
    } catch (error) {
      if (!isCurrent()) return;
      const failure = organizationFailure(error);
      if (failure?.blockSelection) {
        inFlight.current = false;
        setPending(false);
        workspace.rejectSelection(failure.message);
      } else setNotice(failure?.message ?? "We couldn’t check your flight. Please try again.");
    } finally {
      if (isCurrent()) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }

  const result =
    canSearch &&
    completed?.organizationId === selectedOrganizationId &&
    completed.version === version
      ? completed.result
      : null;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-accent-foreground">
          <Plane className="h-4 w-4" aria-hidden="true" /> Check My Flight · One-way
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Check if you can fly cheaper
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Enter the flight you found and your travel requirements. Discover cheaper alternatives and
          see which conditions are verified.
        </p>
      </header>
      <p className="rounded-lg border border-highlight/40 bg-accent p-3 text-sm text-accent-foreground">
        Travelport Preproduction · Test environment. Results are not verified as live bookable
        fares.
      </p>
      {!canSearch && (
        <p id="check-organization-status" role="status" className="text-sm text-muted-foreground">
          {workspace.status === "loading"
            ? "Loading organizations…"
            : (workspace.error ??
              workspace.authorizationError ??
              (workspace.memberships.length
                ? "Select an organization to check your flight."
                : "No organization assigned. Ask your administrator to arrange access."))}
        </p>
      )}
      <WorkspaceSection title="Flight details and requirements" className="shadow-card" keepMounted>
        <form aria-label="Check My Flight" onSubmit={submit} noValidate aria-busy={pending}>
          <fieldset disabled={pending} className="min-w-0 space-y-6">
            <legend className="mb-4 text-lg font-semibold">The flight you found</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="check-origin" label="Origin airport" error={errors["origin"]}>
                <Input
                  id="check-origin"
                  required
                  list="check-airports"
                  placeholder="JFK"
                  maxLength={3}
                  value={values.origin}
                  onChange={(e) => set("origin", e.target.value.toUpperCase())}
                  aria-invalid={!!errors["origin"]}
                  aria-describedby={errors["origin"] ? "check-origin-error" : undefined}
                />
              </Field>
              <Field
                id="check-destination"
                label="Destination airport"
                error={errors["destination"]}
              >
                <Input
                  id="check-destination"
                  required
                  list="check-airports"
                  placeholder="LAX"
                  maxLength={3}
                  value={values.destination}
                  onChange={(e) => set("destination", e.target.value.toUpperCase())}
                  aria-invalid={!!errors["destination"]}
                  aria-describedby={errors["destination"] ? "check-destination-error" : undefined}
                />
              </Field>
              <datalist id="check-airports">
                {KZ_AIRPORTS.map((airport) => (
                  <option key={airport.iata} value={airport.iata}>
                    {airport.city} — {airport.name}
                  </option>
                ))}
              </datalist>
              <Field id="check-date" label="Departure date" error={errors["departureDate"]}>
                <Input
                  id="check-date"
                  type="date"
                  required
                  value={values.departureDate}
                  onChange={(e) => set("departureDate", e.target.value)}
                  aria-invalid={!!errors["departureDate"]}
                  aria-describedby={errors["departureDate"] ? "check-date-error" : undefined}
                />
              </Field>
              <Field id="check-passengers" label="Passengers (adults)" error={errors["passengers"]}>
                <Input
                  id="check-passengers"
                  type="number"
                  min={1}
                  max={9}
                  step={1}
                  required
                  value={values.passengers}
                  onChange={(e) => set("passengers", e.target.value)}
                  aria-invalid={!!errors["passengers"]}
                  aria-describedby={errors["passengers"] ? "check-passengers-error" : undefined}
                />
              </Field>
              <Field id="check-cabin" label="Cabin class" error={errors["cabinClass"]}>
                <select
                  id="check-cabin"
                  required
                  className={selectStyle}
                  value={values.cabinClass}
                  onChange={(e) => set("cabinClass", e.target.value as CabinClass)}
                >
                  {CABIN_CLASSES.map((cabin) => (
                    <option key={cabin} value={cabin}>
                      {CABIN_LABELS[cabin]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
                <Field
                  id="check-price"
                  label="Original total price"
                  error={errors["originalPrice"]}
                >
                  <Input
                    id="check-price"
                    type="number"
                    min="0"
                    step="any"
                    required
                    placeholder="Total for all passengers"
                    value={values.originalPrice}
                    onChange={(e) => set("originalPrice", e.target.value)}
                    aria-invalid={!!errors["originalPrice"]}
                    aria-describedby={
                      errors["originalPrice"]
                        ? "check-price-help check-price-error"
                        : "check-price-help"
                    }
                  />
                </Field>
                <Field id="check-currency" label="Currency" error={errors["originalCurrency"]}>
                  <Input
                    id="check-currency"
                    required
                    maxLength={3}
                    list="check-currencies"
                    placeholder="GBP"
                    value={values.originalCurrency}
                    onChange={(e) => set("originalCurrency", e.target.value.toUpperCase())}
                    aria-invalid={!!errors["originalCurrency"]}
                    aria-describedby={
                      errors["originalCurrency"] ? "check-currency-error" : undefined
                    }
                  />
                  <datalist id="check-currencies">
                    {["GBP", "USD", "EUR", "KZT"].map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
              </div>
            </div>
            <p id="check-price-help" className="text-sm text-muted-foreground">
              Enter the total for all passengers in the currency you found. This is your unverified,
              user-provided price. We compare matching currencies only; no conversion is applied.
            </p>
            <div className="space-y-4 border-t pt-5">
              <h2 className="text-lg font-semibold">What do you need to take?</h2>
              <p id="check-baggage-help" className="text-sm text-muted-foreground">
                Choose each allowance explicitly. “Not required” means you don’t need that
                allowance; it does not mean baggage is included. Optional weight is the minimum
                allowance in kilograms, not multiplied by the number of pieces.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                {(["checked", "cabin"] as const).map((kind) => (
                  <BaggageFields
                    key={kind}
                    kind={kind}
                    value={values[kind]}
                    onChange={(value) => set(kind, value)}
                    errors={errors}
                  />
                ))}
              </div>
            </div>
          </fieldset>
          {Object.keys(errors).length > 0 && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              Check the highlighted fields and select both baggage requirements.
            </p>
          )}
          <Button
            type="submit"
            className="mt-6 w-full sm:w-auto"
            disabled={pending || !canSearch}
            aria-describedby={!canSearch ? "check-organization-status" : undefined}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Checking your
                flight…
              </>
            ) : (
              <>
                Check my flight <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>
          {pending && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              Checking alternatives against your requirements. This may take a moment.
            </p>
          )}
        </form>
      </WorkspaceSection>
      {notice && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">
          {notice}
        </p>
      )}
      {result && <FlightCheckResults result={result} />}
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
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function BaggageFields({
  kind,
  value,
  onChange,
  errors,
}: {
  kind: "checked" | "cabin";
  value: BaggageValues;
  onChange: (value: BaggageValues) => void;
  errors: Record<string, string>;
}) {
  const label = kind === "checked" ? "Checked baggage" : "Cabin baggage";
  const prefix = `baggageRequirements.${kind}`;
  const error =
    errors[`${prefix}.status`] ??
    errors[`baggageRequirements.${kind}`] ??
    errors["baggageRequirements"];
  return (
    <fieldset
      className="min-w-0 space-y-3 rounded-lg border p-4"
      aria-describedby="check-baggage-help"
    >
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <Field id={`check-${kind}-status`} label={`${label} requirement`} error={error}>
        <select
          id={`check-${kind}-status`}
          required
          className={selectStyle}
          value={value.status}
          onChange={(e) =>
            onChange({ ...value, status: e.target.value as BaggageValues["status"] })
          }
          aria-invalid={!!error}
          aria-describedby={error ? `check-${kind}-status-error` : undefined}
        >
          <option value="">Choose a requirement</option>
          <option value="not_required">Not required</option>
          <option value="required">Required</option>
        </select>
      </Field>
      {value.status === "required" && (
        <div className="grid gap-3">
          <Field
            id={`check-${kind}-pieces`}
            label={`${label} minimum pieces`}
            error={errors[`${prefix}.pieces`]}
          >
            <Input
              id={`check-${kind}-pieces`}
              type="number"
              min={1}
              step={1}
              required
              value={value.pieces}
              onChange={(e) => onChange({ ...value, pieces: e.target.value })}
              aria-invalid={!!errors[`${prefix}.pieces`]}
              aria-describedby={
                errors[`${prefix}.pieces`] ? `check-${kind}-pieces-error` : undefined
              }
            />
          </Field>
          <Field
            id={`check-${kind}-weight`}
            label={`${label} minimum weight (kg, optional)`}
            error={errors[`${prefix}.weightKg`]}
          >
            <Input
              id={`check-${kind}-weight`}
              type="number"
              min={0}
              step="any"
              value={value.weightKg}
              onChange={(e) => onChange({ ...value, weightKg: e.target.value })}
              aria-invalid={!!errors[`${prefix}.weightKg`]}
              aria-describedby={
                errors[`${prefix}.weightKg`] ? `check-${kind}-weight-error` : undefined
              }
            />
          </Field>
        </div>
      )}
    </fieldset>
  );
}
