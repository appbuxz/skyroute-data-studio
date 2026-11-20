import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n/language-context";
import { CABIN_LABELS, type FlightOffer, type FlightSearchSnapshot } from "@/lib/flights/types";
import { FlightDateTime } from "./flight-date-time";

export const FLIGHT_SHORTLIST_LIMIT = 3;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function FlightShortlist({
  search,
  offers,
  onRemove,
}: {
  search: FlightSearchSnapshot;
  offers: FlightOffer[];
  onRemove: (id: string) => void;
}) {
  const { t, number } = useLanguage();
  const photoInputId = useId();
  const [open, setOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadedPhoto, setLoadedPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
      setPhotoError("Choose a JPEG, PNG or WebP photo up to 5 MiB.");
      return;
    }
    setPhotoError(null);
    setPhotoUrl(null);
    setPhotoFile(file);
  }

  function removePhoto() {
    setPhotoFile(null);
    setPhotoUrl(null);
    setPhotoError(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex flex-wrap items-center gap-3">
        <DialogTrigger asChild>
          <Button type="button" disabled={offers.length === 0}>
            {t("Preview flight shortlist")}
          </Button>
        </DialogTrigger>
        <p className="text-sm text-muted-foreground" role="status">
          {t("{count} of {limit} flights selected", {
            count: number(offers.length),
            limit: number(FLIGHT_SHORTLIST_LIMIT),
          })}
        </p>
      </div>
      <DialogContent className="max-h-[90dvh] max-w-[min(96vw,64rem)] overflow-y-auto">
        <DialogHeader className="pr-7">
          <DialogTitle>{t("Flight shortlist")}</DialogTitle>
          <DialogDescription>{t("Review the options before saving the PDF.")}</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="space-y-4">
            <ul className="space-y-2">
              {offers.map((offer) => (
                <li
                  key={offer.id}
                  className="flex flex-wrap items-center justify-between gap-1 rounded-lg border p-2.5"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {offer.carrier} · {offer.flightNumber}
                    </p>
                    <p className="text-sm">
                      {number(offer.price.amount)} {offer.price.currency}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t("Remove {flight} from the shortlist", {
                      flight: `${offer.carrier} ${offer.flightNumber}`,
                    })}
                    onClick={() => onRemove(offer.id)}
                  >
                    {t("Remove")}
                  </Button>
                </li>
              ))}
            </ul>
            {offers.length === 0 && (
              <p className="text-sm">{t("Select at least one flight to export.")}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor={photoInputId}>{t("Cover photo (optional)")}</Label>
              <Input
                id={photoInputId}
                type="file"
                accept={PHOTO_TYPES.join(",")}
                aria-describedby={`${photoInputId}-help`}
                onChange={(event) => {
                  choosePhoto(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <p id={`${photoInputId}-help`} className="text-xs text-muted-foreground">
                {t("Choose a JPEG, PNG or WebP photo up to 5 MiB.")}
              </p>
              {photoError && (
                <p role="alert" className="text-sm text-destructive">
                  {t(photoError)}
                </p>
              )}
              {photoFile && (
                <Button size="sm" variant="outline" onClick={removePhoto}>
                  {t("Remove photo")}
                </Button>
              )}
            </div>
            <Button
              onClick={() => window.print()}
              disabled={
                offers.length === 0 || (!!photoFile && (!photoUrl || loadedPhoto !== photoUrl))
              }
            >
              {t("Save as PDF")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("Choose Save as PDF in the print dialog.")}
            </p>
          </div>
          <section aria-label={t("PDF preview")} className="min-w-0 rounded-lg bg-muted p-3 sm:p-5">
            <ShortlistDocument
              search={search}
              offers={offers}
              photoUrl={photoUrl}
              onPhotoLoad={() => setLoadedPhoto(photoUrl)}
              onPhotoError={() => {
                removePhoto();
                setPhotoError("This photo could not be opened.");
              }}
            />
          </section>
        </div>
      </DialogContent>
      {open &&
        offers.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="flight-shortlist-print" aria-hidden="true">
            <ShortlistDocument
              search={search}
              offers={offers}
              photoUrl={loadedPhoto === photoUrl ? photoUrl : null}
            />
          </div>,
          document.body,
        )}
    </Dialog>
  );
}

function ShortlistDocument({
  search,
  offers,
  photoUrl,
  onPhotoLoad,
  onPhotoError,
}: {
  search: FlightSearchSnapshot;
  offers: FlightOffer[];
  photoUrl: string | null;
  onPhotoLoad?: () => void;
  onPhotoError?: () => void;
}) {
  const { t, date, dateTime, number } = useLanguage();
  const { params } = search;
  const formatDate = (value: string) => date(new Date(`${value}T00:00:00Z`), "UTC");
  const testEnvironment =
    search.environment === "test" ||
    (!search.environment && offers.some((offer) => offer.provider === "travelport"));

  return (
    <article className="space-y-4 bg-white p-4 text-sm text-slate-900 sm:p-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold tracking-widest text-slate-600">Flight Analytics</p>
        <h2 className="text-2xl font-semibold text-slate-900">
          {params.origin} → {params.destination}
        </h2>
        <p>
          {formatDate(params.departureDate)}
          {params.returnDate && ` – ${formatDate(params.returnDate)}`}
        </p>
        <p>
          {t("Passengers")} {number(params.passengers)} · {t(CABIN_LABELS[params.cabinClass])}
        </p>
        {testEnvironment && (
          <p className="font-semibold">{t("Test data · Travelport Preproduction")}</p>
        )}
      </header>
      {photoUrl && (
        <img
          src={photoUrl}
          alt={t("Cover photo")}
          onLoad={onPhotoLoad}
          onError={onPhotoError}
          className="max-h-48 w-full rounded object-contain print:max-h-36"
        />
      )}
      <ul className="space-y-3">
        {offers.map((offer) => (
          <ShortlistOffer key={offer.id} offer={offer} />
        ))}
      </ul>
      <footer className="space-y-1 border-t border-slate-300 pt-3 text-xs text-slate-700">
        <p>{t("Retrieved: {date}", { date: dateTime(search.fetchedAt) })}</p>
        <p>{t("Search prices and availability may change.")}</p>
      </footer>
    </article>
  );
}

function ShortlistOffer({ offer }: { offer: FlightOffer }) {
  const { t, number } = useLanguage();
  const outbound = offer.outbound?.segments ?? [];
  const inbound = offer.inbound?.segments ?? [];

  function allowance(kind: "checked" | "cabin") {
    const details = offer.baggage?.[kind];
    if (
      !details ||
      !(offer.comparisonEvidence?.baggageScopes?.[kind] || offer.comparisonEvidence?.baggageScope)
    ) {
      return t("No data");
    }
    const parts = [];
    if (details.pieces !== undefined)
      parts.push(t("{count} pc", { count: number(details.pieces) }));
    if (details.weightKg !== undefined)
      parts.push(t("{weight} kg", { weight: number(details.weightKg) }));
    return parts.join(" · ") || t("No data");
  }

  return (
    <li className="space-y-2 border-t border-slate-300 pt-3">
      <div className="flex flex-wrap justify-between gap-x-4 font-semibold">
        <p>
          {offer.carrier} · {offer.flightNumber}
        </p>
        <p className="whitespace-nowrap">
          {number(offer.price.amount)} {offer.price.currency}
        </p>
      </div>
      <p>
        {offer.stops === 0
          ? t("Direct flight")
          : offer.stops === 1
            ? t("1 stop")
            : t("{count} stops", { count: number(offer.stops) })}
      </p>
      {outbound.length === 0 && (
        <p>
          <FlightDateTime value={offer.departureAt} /> → <FlightDateTime value={offer.arrivalAt} />
        </p>
      )}
      {[...outbound, ...inbound].map((segment, index) => (
        <p key={index} className="break-inside-avoid text-xs">
          {segment.origin} → {segment.destination} · {segment.carrier} {segment.flightNumber}
          <br />
          <FlightDateTime value={segment.departureAt} /> →{" "}
          <FlightDateTime value={segment.arrivalAt} />
        </p>
      ))}
      <div className="space-y-1 text-xs">
        <p>
          {t("Checked baggage")} · {allowance("checked")}
        </p>
        <p>
          {t("Cabin baggage")} · {allowance("cabin")}
        </p>
      </div>
    </li>
  );
}
