import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { shortlistHotelSchema, type ShortlistHotel } from "@/lib/flights/search-session";
import { useLanguage } from "@/lib/i18n/language-context";

export function ShortlistHotelForm({
  hotel,
  onApply,
  onCancel,
}: {
  hotel: ShortlistHotel | undefined;
  onApply: (hotel: ShortlistHotel) => boolean;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const id = useId();
  const [error, setError] = useState<string>();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const amount = String(fields.get("amount")).trim().replace(",", ".");
    const parsed = shortlistHotelSchema.safeParse({
      ...Object.fromEntries(fields),
      amount: /^\d+(?:\.\d+)?$/.test(amount) ? Number(amount) : NaN,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues.some((issue) => issue.code === "custom" && issue.path[0] === "checkOut")
          ? "Hotel check-out must be after check-in."
          : "Enter a valid hotel name, dates, price and currency code.",
      );
      return;
    }
    if (!onApply(parsed.data)) setError("Could not update the hotel.");
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${id}-name`}>{t("Hotel name")}</Label>
        <Input id={`${id}-name`} name="name" defaultValue={hotel?.name} required />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-checkIn`}>{t("Check-in")}</Label>
          <Input
            id={`${id}-checkIn`}
            name="checkIn"
            type="date"
            defaultValue={hotel?.checkIn}
            required
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-checkOut`}>{t("Check-out")}</Label>
          <Input
            id={`${id}-checkOut`}
            name="checkOut"
            type="date"
            defaultValue={hotel?.checkOut}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-amount`}>{t("Total stay price")}</Label>
          <Input
            id={`${id}-amount`}
            name="amount"
            inputMode="decimal"
            defaultValue={hotel?.amount}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-currency`}>{t("Currency code")}</Label>
          <Input
            id={`${id}-currency`}
            name="currency"
            defaultValue={hotel?.currency}
            placeholder="KZT"
            maxLength={3}
            required
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-comment`}>{t("Comment (optional)")}</Label>
        <Textarea id={`${id}-comment`} name="comment" defaultValue={hotel?.comment} rows={2} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm">
          {t("Save hotel")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("Cancel")}
        </Button>
      </div>
    </form>
  );
}
