import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppearanceOptions } from "@/components/common/appearance-options";
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
import { FLIGHT_SHORTLIST_LIMIT, type ShortlistHotel } from "@/lib/flights/search-session";
import { CABIN_LABELS, type FlightOffer, type FlightSearchSnapshot } from "@/lib/flights/types";
import { FlightDateTime } from "./flight-date-time";
import { ShortlistHotelForm } from "./shortlist-hotel-form";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function FlightShortlist({
  search,
  offers,
  hotel,
  onHotelChange,
  onRemove,
  onSave,
  onClose,
}: {
  search: FlightSearchSnapshot;
  offers: FlightOffer[];
  hotel: ShortlistHotel | undefined;
  onHotelChange: (hotel: ShortlistHotel | undefined) => boolean;
  onRemove?: (id: string) => void;
  onSave?: () => boolean;
  onClose?: () => void;
}) {
  const { t, number, date } = useLanguage();
  const photoInputId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(Boolean(onClose));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadedPhoto, setLoadedPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [editingHotel, setEditingHotel] = useState(false);
  const [hotelError, setHotelError] = useState(false);
  const [saveError, setSaveError] = useState(false);

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

  function applyHotel(nextHotel: ShortlistHotel | undefined) {
    if (!onHotelChange(nextHotel)) return false;
    setEditingHotel(false);
    setHotelError(false);
    return true;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setEditingHotel(false);
          setHotelError(false);
          setSaveError(false);
        }
        if (!nextOpen && onClose) onClose();
        else setOpen(nextOpen);
      }}
    >
      {!onClose && (
        <div className="shortlist-actions flex flex-wrap items-center gap-3">
          <DialogTrigger asChild>
            <Button type="button" disabled={offers.length === 0}>
              {t("Preview flight shortlist")}
            </Button>
          </DialogTrigger>
          {onSave && (
            <Button type="button" variant="outline" disabled={offers.length === 0} onClick={onSave}>
              {t("Save shortlist")}
            </Button>
          )}
          <p className="text-sm text-muted-foreground" role="status">
            {t("{count} of {limit} flights selected", {
              count: number(offers.length),
              limit: number(FLIGHT_SHORTLIST_LIMIT),
            })}
          </p>
        </div>
      )}
      <DialogContent
        className="flight-shortlist-dialog max-h-[90dvh] max-w-[min(96vw,64rem)] overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          headingRef.current?.focus({ preventScroll: true });
        }}
      >
        <div className="shortlist-appearance rounded-lg border bg-card p-3">
          <AppearanceOptions />
        </div>
        <DialogHeader className="shortlist-heading pr-7">
          <DialogTitle ref={headingRef} tabIndex={-1} className="outline-none">
            {t("Flight shortlist")}
          </DialogTitle>
          <p className="shortlist-route hidden text-sm text-muted-foreground">
            {search.params.origin} → {search.params.destination} ·{" "}
            {date(new Date(search.params.departureDate), "UTC")}
          </p>
          <DialogDescription>{t("Review the options before saving the PDF.")}</DialogDescription>
        </DialogHeader>
        <div className="shortlist-layout grid min-w-0 gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="min-w-0 space-y-4">
            <h3 className="shortlist-panel-title hidden">{t("Flight options")}</h3>
            <ul className="space-y-2">
              {offers.map((offer) => (
                <li
                  key={offer.id}
                  className="shortlist-option flex flex-wrap items-center justify-between gap-1 rounded-lg border p-2.5"
                >
                  <div className="shortlist-option-details">
                    <p className="text-sm font-semibold">
                      {offer.carrier} · {offer.flightNumber}
                    </p>
                    <p className="shortlist-price text-sm">
                      {number(offer.price.amount)} {offer.price.currency}
                    </p>
                  </div>
                  {onRemove && (
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
                  )}
                </li>
              ))}
            </ul>
            {offers.length === 0 && (
              <p className="text-sm">{t("Select at least one flight to export.")}</p>
            )}
            <section className="space-y-2 border-t pt-3">
              <h3 className="text-sm font-semibold">{t("Hotel")}</h3>
              {editingHotel ? (
                <ShortlistHotelForm
                  hotel={hotel}
                  onApply={applyHotel}
                  onCancel={() => setEditingHotel(false)}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setHotelError(false);
                      setEditingHotel(true);
                    }}
                  >
                    {t(hotel ? "Edit hotel" : "Add hotel")}
                  </Button>
                  {hotel && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setHotelError(!applyHotel(undefined))}
                    >
                      {t("Remove hotel")}
                    </Button>
                  )}
                </div>
              )}
              {hotelError && (
                <p role="alert" className="text-sm text-destructive">
                  {t("Could not update the hotel.")}
                </p>
              )}
            </section>
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
            <div className="flex flex-wrap gap-2">
              {onSave && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={editingHotel || offers.length === 0}
                  onClick={() => {
                    if (onSave()) {
                      setSaveError(false);
                      setOpen(false);
                    } else {
                      setSaveError(true);
                    }
                  }}
                >
                  {t("Save shortlist")}
                </Button>
              )}
              <Button
                onClick={() => window.print()}
                disabled={
                  editingHotel ||
                  offers.length === 0 ||
                  (!!photoFile && (!photoUrl || loadedPhoto !== photoUrl))
                }
              >
                {t("Save as PDF")}
              </Button>
            </div>
            {saveError && (
              <p role="alert" className="text-sm text-destructive">
                {t("Could not save the shortlist.")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("Choose Save as PDF in the print dialog.")}
            </p>
          </div>
          <section
            aria-label={t("PDF preview")}
            className="shortlist-preview min-w-0 rounded-lg bg-muted p-3 sm:p-5"
          >
            <h3 className="shortlist-panel-title hidden">{t("PDF preview")}</h3>
            <ShortlistDocument
              saved={Boolean(onClose)}
              search={search}
              offers={offers}
              hotel={hotel}
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
              saved={Boolean(onClose)}
              search={search}
              offers={offers}
              hotel={hotel}
              photoUrl={loadedPhoto === photoUrl ? photoUrl : null}
            />
          </div>,
          document.body,
        )}
    </Dialog>
  );
}

function ShortlistDocument({
  saved,
  search,
  offers,
  hotel,
  photoUrl,
  onPhotoLoad,
  onPhotoError,
}: {
  search: FlightSearchSnapshot;
  offers: FlightOffer[];
  saved: boolean;
  hotel: ShortlistHotel | undefined;
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
    <article className="shortlist-document space-y-4 bg-white p-4 text-sm text-slate-900 sm:p-6">
      <header className="space-y-1">
        <p className="shortlist-brand text-xs font-semibold tracking-widest text-slate-600">Flight Analytics</p>
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
          <ShortlistOffer key={offer.id} offer={offer} showPriceLabel={Boolean(hotel)} />
        ))}
      </ul>
      {hotel && (
        <section className="break-inside-avoid space-y-1 border-t border-slate-300 pt-3">
          <h3 className="text-base font-semibold">{t("Hotel")}</h3>
          <p className="break-words font-semibold">{hotel.name}</p>
          <p>
            {t("Check-in")} · {formatDate(hotel.checkIn)}
          </p>
          <p>
            {t("Check-out")} · {formatDate(hotel.checkOut)}
          </p>
          <p className="font-semibold">
            {t("Total stay price")} · {number(hotel.amount, { maximumFractionDigits: 20 })}{" "}
            {hotel.currency}
          </p>
          {hotel.comment && <p className="whitespace-pre-wrap break-words">{hotel.comment}</p>}
        </section>
      )}
      <footer className="shortlist-document-footer space-y-1 border-t border-slate-300 pt-3 text-xs text-slate-700">
        <p>{t("Retrieved: {date}", { date: dateTime(search.fetchedAt) })}</p>
        {saved && (
          <p>
            {t(
              hotel
                ? "Flight prices were saved at the time of the search."
                : "Prices were saved at the time of the search.",
            )}
          </p>
        )}
        <p>{t("Search prices and availability may change.")}</p>
      </footer>
    </article>
  );
}

function ShortlistOffer({ offer, showPriceLabel }: { offer: FlightOffer; showPriceLabel: boolean }) {
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
        <p>
          {showPriceLabel && `${t("Flight price")} · `}
          <span className="shortlist-price whitespace-nowrap">
            {number(offer.price.amount)} {offer.price.currency}
          </span>
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
