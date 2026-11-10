import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { OrganizationId } from "../flights/types";
import { clearLegacyFlightSearch } from "../flights/search-session";
import { supabase } from "../supabase/client";
import { getOrganizationMemberships, type OrganizationMembership } from "./session.functions";
import {
  OrganizationWorkspaceContext,
  organizationFailure,
  type WorkspaceSearch,
} from "./workspace-context";

export function OrganizationWorkspaceProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const listMemberships = useServerFn(getOrganizationMemberships);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<OrganizationId | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [authorizationError, setAuthorizationError] = useState<string | null>(null);
  const [search, setSearch] = useState<WorkspaceSearch | null>(null);
  const [version, setVersion] = useState(0);
  const generation = useRef(0);
  const loadRequest = useRef(0);
  const mounted = useRef(false);
  const selected = useRef<OrganizationId | null>(null);
  const selectionWasMade = useRef(false);
  const sessionChanged = useRef(false);

  const invalidate = useCallback(() => {
    generation.current += 1;
    setVersion(generation.current);
    setSearch(null);
  }, []);

  const cancelPending = useCallback(() => {
    mounted.current = false;
    ++loadRequest.current;
    ++generation.current;
  }, []);

  const reloadMemberships = useCallback(async () => {
    if (sessionChanged.current) return;
    const request = ++loadRequest.current;
    invalidate();
    setStatus("loading");
    setError(null);
    try {
      const choices = await listMemberships();
      if (!mounted.current || request !== loadRequest.current) return;
      setMemberships(choices);
      if (
        selected.current &&
        !choices.some((choice) => choice.organizationId === selected.current)
      ) {
        selected.current = null;
        setSelectedOrganizationId(null);
        setAuthorizationError(
          "Your selected organization is no longer available. Select an organization to continue.",
        );
      } else {
        setAuthorizationError(null);
        // Only initial discovery may automatically choose a sole membership.
        // Losing an existing selection must never select a different agency.
        if (!selectionWasMade.current && choices.length === 1) {
          selected.current = choices[0]!.organizationId;
          selectionWasMade.current = true;
          setSelectedOrganizationId(selected.current);
        }
      }
      setStatus("ready");
    } catch (failure) {
      if (!mounted.current || request !== loadRequest.current) return;
      setMemberships([]);
      selected.current = null;
      setSelectedOrganizationId(null);
      // Preserve selectionWasMade: a retry must not choose another agency.
      setStatus("error");
      setError(
        organizationFailure(failure)?.message ?? "Unable to load organizations. Please try again.",
      );
    }
  }, [invalidate, listMemberships]);

  useEffect(() => {
    mounted.current = true;
    // Legacy user-only snapshots are deliberately never loaded or written.
    clearLegacyFlightSearch();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session?.user.id && session.user.id !== userId)) {
        sessionChanged.current = true;
        ++loadRequest.current;
        invalidate();
        selected.current = null;
        setSelectedOrganizationId(null);
        setMemberships([]);
        setStatus("error");
        setError("Your session has changed. Sign in again.");
      }
    });
    void reloadMemberships();
    return () => {
      cancelPending();
      subscription.unsubscribe();
    };
  }, [cancelPending, invalidate, reloadMemberships, userId]);

  const isCurrentScope = useCallback(
    () => mounted.current && generation.current === version,
    [version],
  );
  const canSearch =
    status === "ready" && selectedOrganizationId !== null && authorizationError === null;

  return (
    <OrganizationWorkspaceContext.Provider
      value={{
        memberships,
        selectedOrganizationId,
        status,
        error,
        authorizationError,
        canSearch,
        version,
        search: canSearch && search?.organizationId === selectedOrganizationId ? search : null,
        reloadMemberships: () => {
          void reloadMemberships();
        },
        isCurrentScope,
        selectOrganization(id) {
          const choice = memberships.find((membership) => membership.organizationId === id);
          invalidate();
          selected.current = choice?.organizationId ?? null;
          selectionWasMade.current = true;
          setSelectedOrganizationId(selected.current);
          setAuthorizationError(null);
        },
        publishSearch(result) {
          if (isCurrentScope() && canSearch && result.organizationId === selectedOrganizationId)
            setSearch(result);
        },
        clearSearch() {
          setSearch(null);
        },
        rejectSelection(message) {
          invalidate();
          setAuthorizationError(message);
        },
      }}
    >
      {children}
    </OrganizationWorkspaceContext.Provider>
  );
}
