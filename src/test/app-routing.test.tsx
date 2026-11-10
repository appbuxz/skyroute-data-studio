import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
  it.each(["/search", "/dashboard", "/analysis", "/reports"])("keeps %s under the authenticated workspace", (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes(path);
    expect(matches.map((match) => match.routeId)).toContain("/_authenticated");
    expect(matches.map((match) => match.routeId)).toContain("/_authenticated/_workspace");
  });
  it("keeps login outside the protected layout", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes("/login");
    expect(matches.at(-1)?.routeId).toBe("/login");
    expect(matches.map((match) => match.routeId)).not.toContain("/_authenticated");
  });
});
