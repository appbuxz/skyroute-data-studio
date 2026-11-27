import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/common/page-header";
import { FlightShortlist } from "@/components/flights/flight-shortlist";
import { Button } from "@/components/ui/button";
import { listAgencyJournalEntries } from "@/lib/flights/agency-journal.functions";
import { useLanguage } from "@/lib/i18n/language-context";
import { requireAgencyWorkspace } from "@/lib/organizations/agency-access";
import { useOrganizationWorkspace } from "@/lib/organizations/workspace-context";

export const Route = createFileRoute("/_authenticated/_workspace/flight-journal")({
  beforeLoad: requireAgencyWorkspace,
  head: () => ({ meta: [{ title: "Flight journal — Flight Analytics" }] }),
  component: FlightJournal,
});

function FlightJournal() {
  const { t } = useLanguage();
  const workspace = useOrganizationWorkspace();
  const organizationId = workspace.selectedOrganizationId;
  const error = workspace.authorizationError ?? workspace.error;
  return (
    <>
      <PageHeader title={t("Flight journal")} />
      {workspace.status === "loading" && <p role="status">{t("Loading organizations…")}</p>}
      {error && <p role="alert">{t(error)}</p>}
      {workspace.status === "ready" && !organizationId && !error && (
        <p>{t("Select an organization")}</p>
      )}
      {workspace.canSearch && organizationId && (
        <JournalEntries
          key={JSON.stringify([workspace.userId, organizationId, workspace.version])}
        />
      )}
    </>
  );
}

function JournalEntries() {
  const { t, date, dateTime } = useLanguage();
  const { selectedOrganizationId, userId, version, isCurrentScope } = useOrganizationWorkspace();
  const list = useServerFn(listAgencyJournalEntries);
  const [page, setPage] = useState(0);
  const [opened, setOpened] = useState<string>();
  const query = useQuery({
    queryKey: ["flight-journal", userId, selectedOrganizationId, version, page],
    queryFn: ({ signal }) => {
      if (!selectedOrganizationId) throw new Error("Organization selection required");
      return list({ data: { organizationId: selectedOrganizationId, page }, signal });
    },
    gcTime: 0,
  });

  if (query.isPending) return <p role="status">{t("Loading flight journal…")}</p>;
  if (query.isError) {
    return (
      <div className="space-y-3">
        <p role="alert">{t("Unable to load the flight journal.")}</p>
        <Button
          type="button"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {t("Retry loading the journal")}
        </Button>
      </div>
    );
  }
  const { entries, hasNext } = query.data;
  const selected = entries.find((entry) => entry.id === opened);
  return (
    <div className="space-y-4">
      {entries.length === 0 && <p>{t("No flight journal entries yet.")}</p>}
      <ul className="space-y-2">
        {entries.map(({ id, clientLabel, createdAt, snapshot }) => (
          <li
            key={id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0 text-sm">
              <p className="break-words font-medium">{clientLabel}</p>
              {snapshot && (
                <p>
                  {snapshot.params.origin} → {snapshot.params.destination} ·{" "}
                  {date(new Date(snapshot.params.departureDate), "UTC")}
                  {snapshot.params.returnDate &&
                    ` – ${date(new Date(snapshot.params.returnDate), "UTC")}`}
                </p>
              )}
              <p className="text-muted-foreground">
                {t("Saved: {date}", { date: dateTime(createdAt) })}
              </p>
            </div>
            {snapshot ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (isCurrentScope()) setOpened(id);
                }}
              >
                {t("Open shortlist")}
              </Button>
            ) : (
              <p className="text-sm text-destructive">{t("This shortlist could not be opened.")}</p>
            )}
          </li>
        ))}
      </ul>
      {(page > 0 || hasNext) && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            {t("Previous page")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!hasNext}
            onClick={() => setPage(page + 1)}
          >
            {t("Next page")}
          </Button>
        </div>
      )}
      {selected?.snapshot && (
        <FlightShortlist
          key={selected.id}
          search={selected.snapshot}
          offers={selected.snapshot.offers}
          hotel={selected.snapshot.hotel}
          clientLabel={selected.clientLabel}
          onClose={() => setOpened(undefined)}
        />
      )}
    </div>
  );
}
