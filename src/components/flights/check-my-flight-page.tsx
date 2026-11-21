import { PageHeader } from "@/components/common/page-header";
import { useLanguage } from "@/lib/i18n/language-context";
import { WorkspaceSection } from "@/components/common/workspace-section";
import type { ZodIssue } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Info, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KZ_AIRPORTS } from "@/lib/flights/airports";
import {
  flightCheckSchema,
  type FlightCheckInput,
  type FlightCheckResult,
} from "@/lib/flights/flight-check";
import { checkFlightServer } from "@/lib/flights/flight-check.functions";
import { CABIN_CLASSES, CABIN_LABELS, type CabinClass } from "@/lib/flights/types";
import {
  organizationFailure,
  useOrganizationWorkspace,
} from "@/lib/organizations/workspace-context";
import { FlightCheckResults } from "./flight-check-results";

const selectStyle =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
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
  const { t, message } = useLanguage();
  const checkFlight = useServerFn(checkFlightServer);
  const workspace = useOrganizationWorkspace();
  const { selectedOrganizationId, version, canSearch } = workspace;
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState<{
    result: FlightCheckResult;
    input: FlightCheckInput;
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
      if (isCurrent())
        setCompleted({
          result,
          input: parsed.data,
          organizationId: selectedOrganizationId,
          version,
        });
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
    <div className="workspace-flight-check">
      <PageHeader
        title={t("Check My Flight")}
        description={t(
          "Compare a one-way fare you found with alternatives that meet your travel requirements.",
        )}
      />
      <p className="workspace-check-environment flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t(
          "Travelport Preproduction · Test environment. Results are not verified as live bookable fares.",
        )}
      </p>
      {!canSearch && (
        <p id="check-organization-status" role="status" className="text-sm text-muted-foreground">
          {workspace.status === "loading"
            ? t("Loading organizations…")
            : message(
                workspace.error ??
                  workspace.authorizationError ??
                  (workspace.memberships.length
                    ? "Select an organization to check your flight."
                    : "No organization assigned. Ask your administrator to arrange access."),
              )}
        </p>
      )}
      <WorkspaceSection
        title="Flight details and requirements"
        className="workspace-check-form flight-search-panel"
        keepMounted
      >
        <form
          aria-label={t("Check My Flight")}
          aria-describedby="check-form-help"
          onSubmit={submit}
          noValidate
          aria-busy={pending}
        >
          <p id="check-form-help" className="mb-4 text-sm text-muted-foreground">
            {t(
              "All fields are required unless marked optional. Use three-letter airport and currency codes.",
            )}
          </p>
          <fieldset disabled={pending} className="min-w-0 space-y-4">
            <legend className="mb-2 text-sm font-semibold">{t("The flight you found")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="check-origin" label="Origin airport" error={errors["origin"]}>
                <Input
                  id="check-origin"
                  required
                  list="check-airports"
                  placeholder="ALA"
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
                  placeholder="IST"
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
                    {t(airport.city)} — {t(airport.name)}
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
                  aria-invalid={!!errors.cabinClass}
                  aria-describedby={errors.cabinClass ? "check-cabin-error" : undefined}
                  required
                  className={selectStyle}
                  value={values.cabinClass}
                  onChange={(e) => set("cabinClass", e.target.value as CabinClass)}
                >
                  {CABIN_CLASSES.map((cabin) => (
                    <option key={cabin} value={cabin}>
                      {t(CABIN_LABELS[cabin])}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,0.55fr)] gap-3">
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
                    placeholder="KZT"
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
              {t(
                "Enter the total for all passengers. Only prices in the same currency are compared.",
              )}
            </p>
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">{t("Baggage requirements")}</h3>
              <p id="check-baggage-help" className="text-sm text-muted-foreground">
                {t(
                  "Choose both requirements. “Not required” means you don’t need that allowance; it does not mean baggage is included. Optional weight is the minimum allowance in kilograms, not multiplied by the number of pieces.",
                )}
              </p>
              <div className="grid items-start gap-3 sm:grid-cols-2">
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
              {t("Check the highlighted fields and select both baggage requirements.")}
            </p>
          )}
          <Button
            type="submit"
            className="mt-6 w-full sm:w-auto"
            disabled={pending || !canSearch}
            aria-describedby={!canSearch ? "check-organization-status" : undefined}
          >
            {pending ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Search aria-hidden="true" />
            )}
            {t(pending ? "Checking your flight…" : "Check my flight")}
          </Button>
        </form>
      </WorkspaceSection>
      <p role="status" className="sr-only">
        {pending
          ? t("Checking alternatives against your requirements. This may take a moment.")
          : ""}
      </p>
      {notice && (
        <p role="alert" className="rounded-lg border border-destructive/35 bg-card p-4 text-sm">
          {message(notice)}
        </p>
      )}
      {result && completed && (
        <div className="workspace-check-result min-w-0 scroll-mt-16">
          <FlightCheckResults result={result} input={completed.input} />
        </div>
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
  const { t, message } = useLanguage();
  return (
    <div className="min-w-0 grid content-start gap-1.5">
      <Label htmlFor={id} className="text-[13px] text-muted-foreground">
        {t(label)}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {message(error)}
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
  const { t } = useLanguage();
  const label = kind === "checked" ? "Checked baggage" : "Cabin baggage";
  const prefix = `baggageRequirements.${kind}`;
  const error =
    errors[`${prefix}.status`] ??
    errors[`baggageRequirements.${kind}`] ??
    errors["baggageRequirements"];
  return (
    <fieldset
      className="min-w-0 space-y-3 rounded-md border bg-background/50 p-3"
      aria-describedby="check-baggage-help"
    >
      <legend className="px-1 text-sm font-semibold">{t(label)}</legend>
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
          <option value="">{t("Choose a requirement")}</option>
          <option value="not_required">{t("Not required")}</option>
          <option value="required">{t("Required")}</option>
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
