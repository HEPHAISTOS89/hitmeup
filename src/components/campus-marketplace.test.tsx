// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("./campus-map", () => ({
  CampusMap: ({ services, onSelect, popupContent }: { services: Array<{ id: string; title: string }>; onSelect: (id: string) => void; popupContent?: React.ReactNode }) => (
    <div data-testid="map">
      {services.length} map listings
      {services.map((service) => <button type="button" key={service.id} aria-label={`Select ${service.title}`} onClick={() => onSelect(service.id)}>{service.title}</button>)}
      {popupContent}
    </div>
  ),
}));

vi.mock("./theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

import { CampusMarketplace, chatScrollBehavior } from "./campus-marketplace";

afterEach(cleanup);

describe("expanded marketplace taxonomy", () => {
  it("reveals the icon-backed subservices for a selected category", () => {
    render(<CampusMarketplace initialEntry="app" dataMode="preview" />);

    const rail = screen.getByRole("group", { name: "Browse all categories" });
    fireEvent.click(within(rail).getByRole("button", { name: /^HitMeUp/i }));

    const subcategories = screen.getByRole("group", { name: "Hit Me Up / Social subcategories" });
    expect(subcategories).toHaveTextContent("Pickup games");
    expect(screen.getByTestId("map")).toHaveTextContent("1 map listings");
  });

  it("separates permanent sponsored pins from temporary posts", () => {
    render(<CampusMarketplace initialEntry="app" dataMode="preview" />);

    const duration = screen.getByRole("group", { name: "Listing duration" });
    fireEvent.click(within(duration).getByRole("button", { name: /Permanent pins/i }));

    expect(screen.getByRole("heading", { name: "Local, for longer." })).toBeInTheDocument();
    expect(screen.getByText("2 found")).toBeInTheDocument();
    expect(screen.getByTestId("map")).toHaveTextContent("2 map listings");
    fireEvent.click(screen.getByRole("button", { name: "Select Coffee, snacks, and study tables" }));
    expect(screen.getByText("Sponsored · permanent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Business details" })).toBeInTheDocument();
  });

  it("discloses the paid-placement boundary without pretending checkout works", () => {
    render(<CampusMarketplace initialEntry="app" dataMode="preview" />);

    fireEvent.click(screen.getByRole("button", { name: /List a business/i }));

    const dialog = screen.getByRole("dialog", { name: "A lasting place on the campus map." });
    expect(dialog).toHaveTextContent("Paid placement, never disguised.");
    expect(within(dialog).getByRole("button", { name: "Checkout not connected" })).toBeDisabled();
  });
});

describe("request selection safety", () => {
  it("does not carry the sample request into a newly selected listing", () => {
    render(<CampusMarketplace initialEntry="app" dataMode="preview" />);

    fireEvent.click(screen.getByRole("button", { name: "Select I need a USB-C charger for an hour" }));
    fireEvent.click(screen.getByRole("button", { name: "Volunteer to help" }));

    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByRole("heading", { name: "I need a USB-C charger for an hour" })).toBeInTheDocument();
    expect(within(drawer).getByText("How can you help?")).toBeInTheDocument();
    expect(screen.queryByText("Hi! Is the 4:30 PM slot still open?")).not.toBeInTheDocument();
  });
});

describe("responsive safety affordances", () => {
  it("keeps compact filters and honest mobile controls after taxonomy expansion", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const marketplace = readFileSync(resolve(process.cwd(), "src/components/campus-marketplace.tsx"), "utf8");
    expect(styles).toContain(".discover-frame .filter-heading { display: flex;");
    expect(styles).toContain(".discover-frame .filter-controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(styles).toContain(".locate-label { display: none; }");
    expect(marketplace).toContain('aria-label="Recenter map"');
    expect(marketplace).toContain('disabled aria-disabled="true" title="Blocking controls are not available in this release"');
  });
});

describe("live marketplace wiring", () => {
  it("forwards duration and subcategory filters and keeps Gemini's exact subtype", () => {
    const marketplace = readFileSync(resolve(process.cwd(), "src/components/campus-marketplace.tsx"), "utf8");
    expect(marketplace).toContain('listingKind: listingFilter === "all" ? undefined : listingFilter');
    expect(marketplace).toContain("item.label === suggestion.subcategory");
  });
});

describe("motion preferences", () => {
  it("uses instant chat scrolling when reduced motion is requested", () => {
    expect(chatScrollBehavior(true)).toBe("auto");
    expect(chatScrollBehavior(false)).toBe("smooth");
  });
});
