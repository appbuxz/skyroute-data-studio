import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  memberships: vi.fn(),
  authenticatedUser: vi.fn(),
  signIn: vi.fn(),
  verifiedUser: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/lib/organizations/session.functions", () => ({
  getOrganizationMemberships: mocks.memberships,
}));
vi.mock("@/lib/supabase/session.functions", () => ({
  getAuthenticatedUser: mocks.authenticatedUser,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: mocks.signIn } },
}));
vi.mock("@/lib/auth/session", () => ({ verifiedUser: mocks.verifiedUser }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => mocks.navigate,
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { Route as LandingRoute } from "@/routes/index";
import { Route as LoginRoute } from "@/routes/login";
import { Route as AuthenticatedRoute } from "@/routes/_authenticated/route";
import { Route as SearchRoute } from "@/routes/_authenticated/_workspace.search";
import { Route as AnalysisRoute } from "@/routes/_authenticated/_workspace.analysis";
import { Route as DashboardRoute } from "@/routes/_authenticated/_workspace.dashboard";
import { Route as ReportsRoute } from "@/routes/_authenticated/_workspace.reports";
import { requireAgencyWorkspace } from "@/lib/organizations/agency-access";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.verifiedUser.mockResolvedValue({ id: "verified-user" });
});
afterEach(cleanup);

describe("Search flights sign-in flow", () => {
  it("links to protected /search and returns there after verified sign-in", async () => {
    const Landing = LandingRoute.options.component!;
    const landing = render(<Landing />);
    expect(screen.getAllByRole("link", { name: "Search flights" })).toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: "Search flights" })) {
      expect(link).toHaveAttribute("href", "/search");
    }
    expect(screen.getByRole("link", { name: "Open workspace" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(
      screen.getAllByText(/Check My Flight.*requires.*organization access/).length,
    ).toBeGreaterThan(0);
    landing.unmount();

    // Exercise the real gate and login component, mocking only network and navigation.
    mocks.authenticatedUser.mockResolvedValue(null);
    const gate = AuthenticatedRoute.options.beforeLoad as () => Promise<unknown>;
    await expect(gate()).rejects.toMatchObject({ options: { to: "/login", replace: true } });
    expect(SearchRoute.options.beforeLoad).toBeUndefined();

    const Login = LoginRoute.options.component!;
    render(<Login />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "traveler@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/search", replace: true }),
    );
    expect(mocks.verifiedUser).toHaveBeenCalledOnce();
    mocks.authenticatedUser.mockResolvedValue({ id: "verified-user" });
    await expect(gate()).resolves.toEqual({ user: { id: "verified-user" } });
  });

  it("does not navigate when identity verification fails", async () => {
    mocks.verifiedUser.mockResolvedValue(null);
    const Login = LoginRoute.options.component!;
    render(<Login />);
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await screen.findByText("Your session could not be verified. Please sign in again.");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

describe("agency tool membership gate", () => {
  it.each([
    ["analytics", AnalysisRoute],
    ["dashboard", DashboardRoute],
    ["reports", ReportsRoute],
  ])("guards %s with a server membership check", async (_label, route) => {
    expect(route.options.beforeLoad).toBe(requireAgencyWorkspace);
    mocks.memberships.mockResolvedValue([]);
    await expect(requireAgencyWorkspace()).rejects.toMatchObject({ options: { to: "/search" } });
    expect(mocks.memberships).toHaveBeenCalledOnce();
  });

  it("allows agency staff including staff with multiple memberships", async () => {
    mocks.memberships.mockResolvedValue([
      { organizationId: "agency-a" },
      { organizationId: "agency-b" },
    ]);
    await expect(requireAgencyWorkspace()).resolves.toBeUndefined();
  });

  it("fails closed if the server cannot verify membership", async () => {
    const error = Object.assign(new Error("Authorization service unavailable"), {
      statusCode: 503,
    });
    mocks.memberships.mockRejectedValue(error);
    await expect(requireAgencyWorkspace()).rejects.toBe(error);
  });
});
