import { useId, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAgencyJournalEntry } from "@/lib/flights/agency-journal.functions";
import type { ShortlistSnapshot } from "@/lib/flights/search-session";
import type { OrganizationId } from "@/lib/flights/types";
import { useLanguage } from "@/lib/i18n/language-context";

export function AgencyJournalSaveForm({
  organizationId,
  isCurrentScope,
  snapshot,
}: {
  organizationId: OrganizationId;
  isCurrentScope: () => boolean;
  snapshot: ShortlistSnapshot;
}) {
  const { t } = useLanguage();
  const save = useServerFn(saveAgencyJournalEntry);
  const labelId = useId();
  const [clientLabel, setClientLabel] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saving = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = clientLabel.trim();
    if (!label || saving.current || !isCurrentScope()) return;
    saving.current = true;
    setStatus("saving");
    try {
      await save({ data: { organizationId, clientLabel: label, snapshot } });
      if (isCurrentScope()) {
        setClientLabel("");
        setStatus("saved");
      }
    } catch {
      if (isCurrentScope()) setStatus("error");
    } finally {
      saving.current = false;
    }
  }

  return (
    <form className="space-y-2 border-t pt-3" onSubmit={submit}>
      <Label htmlFor={labelId}>{t("Client name or reference")}</Label>
      <Input
        id={labelId}
        required
        maxLength={120}
        value={clientLabel}
        disabled={status === "saving"}
        onChange={(event) => {
          setClientLabel(event.currentTarget.value);
          setStatus("idle");
        }}
      />
      <Button type="submit" variant="outline" disabled={!clientLabel.trim() || status === "saving"}>
        {t(status === "saving" ? "Saving to flight journal…" : "Save to flight journal")}
      </Button>
      {status === "saved" && <p role="status">{t("Saved to the flight journal.")}</p>}
      {status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {t("Unable to save the journal entry.")}
        </p>
      )}
    </form>
  );
}
