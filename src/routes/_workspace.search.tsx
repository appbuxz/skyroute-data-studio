import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/common/page-header";
import { flightSearchSchema, type FlightSearchInput } from "@/lib/flights/search-schema";
import { searchFlightsServer } from "@/lib/flights/search.server";
import { KZ_AIRPORTS } from "@/lib/flights/airports";
import { CABIN_CLASSES, CABIN_LABELS, type FlightSearchParams } from "@/lib/flights/types";

export const Route = createFileRoute("/_workspace/search")({
  head: () => ({
    meta: [
      { title: "Flight Search — Flight Analytics" },
      { name: "description", content: "Search routes by origin, destination, dates, passengers and cabin class." },
      { property: "og:title", content: "Flight Search — Flight Analytics" },
      { property: "og:description", content: "Search routes by origin, destination, dates, passengers and cabin class." },
    ],
  }),
  component: SearchPage,
});

type FormValues = Omit<FlightSearchInput, "passengers"> & { passengers: string | number };
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

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const parsed = flightSearchSchema.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormValues;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setPending(true);
    const params: FlightSearchParams = { ...parsed.data, returnDate: parsed.data.returnDate || undefined };
    try {
      const result = await searchFlightsServer({ data: params });

      if (result.status !== "ok") {
         setNotice(result.message);
      }
    } catch (error) {
      console.error("Flight search request failed:", error);
      setNotice("Unable to complete the flight search request.");
    } finally {
      setPending(false);
    }
    }

  return (
    <>
      <PageHeader title="Flight search" description="Define a route to analyse. Enter IATA airport codes, e.g. ALA or NQZ." />
      <Card className="shadow-card">
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} noValidate className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
            <Field id="origin" label="Origin" error={errors.origin}>
              <Input id="origin" list="kz-airports" placeholder="ALA" maxLength={3} value={values.origin}
                onChange={(e) => set("origin", e.target.value.toUpperCase())} aria-invalid={!!errors.origin} />
            </Field>
            <Field id="destination" label="Destination" error={errors.destination}>
              <Input id="destination" list="kz-airports" placeholder="NQZ" maxLength={3} value={values.destination}
                onChange={(e) => set("destination", e.target.value.toUpperCase())} aria-invalid={!!errors.destination} />
            </Field>
            <Field id="passengers" label="Passengers" error={errors.passengers}>
              <Input id="passengers" type="number" min={1} max={9} value={String(values.passengers ?? "")}
                onChange={(e) => set("passengers", e.target.value)} aria-invalid={!!errors.passengers} />
            </Field>
            <Field id="departureDate" label="Departure date" error={errors.departureDate}>
              <Input id="departureDate" type="date" value={values.departureDate}
                onChange={(e) => set("departureDate", e.target.value)} aria-invalid={!!errors.departureDate} />
            </Field>
            <Field id="returnDate" label="Return date (optional)" error={errors.returnDate}>
              <Input id="returnDate" type="date" value={values.returnDate}
                onChange={(e) => set("returnDate", e.target.value)} aria-invalid={!!errors.returnDate} />
            </Field>
            <Field id="cabinClass" label="Cabin class" error={errors.cabinClass}>
              <Select value={values.cabinClass} onValueChange={(v) => set("cabinClass", v as FlightSearchInput["cabinClass"])}>
                <SelectTrigger id="cabinClass"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CABIN_CLASSES.map((c) => <SelectItem key={c} value={c}>{CABIN_LABELS[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <datalist id="kz-airports">
              {KZ_AIRPORTS.map((a) => <option key={a.iata} value={a.iata}>{a.city} — {a.name}</option>)}
            </datalist>
            <div className="md:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Search flights"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {notice && (
        <div role="status" className="mt-6 flex items-start gap-3 rounded-lg border border-highlight/40 bg-accent p-4 text-sm text-accent-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Live search not connected</p>
            <p className="mt-0.5">{notice}</p>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string | undefined; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
