import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceSection } from "./workspace-section";
import { LanguageContext } from "@/lib/i18n/language-context";
import { createTranslator, type Language } from "@/lib/i18n/language";

afterEach(cleanup);

it("retains an edited form while hiding its controls from keyboard and accessibility navigation", () => {
  render(
    <WorkspaceSection title="Search details" keepMounted>
      <input aria-label="Route" defaultValue="ALA" />
      <button>Submit</button>
    </WorkspaceSection>,
  );
  const trigger = screen.getByRole("button", { name: "Search details" });
  fireEvent.change(screen.getByRole("textbox", { name: "Route" }), { target: { value: "IST" } });
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("textbox", { name: "Route" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox", { name: "Route" })).toHaveValue("IST");
  expect(trigger).toHaveAttribute("aria-expanded", "true");
});

it("connects each independent trigger to its own content and respects a closed default", () => {
  render(
    <>
      <WorkspaceSection title="Price distribution">
        <p>Chart</p>
      </WorkspaceSection>
      <WorkspaceSection
        title="Potential price difference"
        defaultOpen={false}
        summary="2 comparison groups"
      >
        <p>Prices</p>
      </WorkspaceSection>
    </>,
  );
  const first = screen.getByRole("button", { name: "Price distribution" });
  const second = screen.getByRole("button", {
    name: "Potential price difference 2 comparison groups",
  });
  expect(first.getAttribute("aria-controls")).not.toBe(second.getAttribute("aria-controls"));
  expect(document.getElementById(first.getAttribute("aria-controls")!)).toHaveTextContent("Chart");
  expect(screen.queryByText("Prices")).not.toBeInTheDocument();
  fireEvent.click(second);
  expect(document.getElementById(second.getAttribute("aria-controls")!)).toHaveTextContent(
    "Prices",
  );
  fireEvent.click(first);
  expect(screen.queryByText("Chart")).not.toBeInTheDocument();
  expect(screen.getByText("Prices")).toBeVisible();
});

it("changes localized titles without resetting the user's disclosure state", () => {
  function page(language: Language) {
    return (
      <LanguageContext.Provider value={{ ...createTranslator(language), setLanguage: vi.fn() }}>
        <WorkspaceSection title="Flight schedules">
          <p>Schedule data</p>
        </WorkspaceSection>
      </LanguageContext.Provider>
    );
  }
  const view = render(page("en"));
  fireEvent.click(screen.getByRole("button", { name: "Flight schedules" }));
  view.rerender(page("ru"));
  expect(screen.getByRole("button", { name: "Расписание рейсов" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  view.rerender(page("kk"));
  const trigger = screen.getByRole("button", { name: "Рейс кестесі" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  expect(screen.getByText("Schedule data")).toBeVisible();
});
