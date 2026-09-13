// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("./campus-map", () => ({
  CampusMap: ({ services, onSelect }: { services: Array<{ id: string; title: string }>; onSelect: (id: string) => void }) => (
    <div aria-label="Mock campus map">
      {services.map((service) => <button type="button" key={service.id} aria-label={`Select ${service.title}`} onClick={() => onSelect(service.id)}>{service.title}</button>)}
    </div>
  ),
}));
vi.mock("./avatar-studio", () => ({ AvatarStudio: () => <div aria-label="Avatar Studio mock" /> }));
vi.mock("./theme-toggle", () => ({ ThemeToggle: () => <button type="button">Theme</button> }));

import { CampusMarketplace, chatScrollBehavior } from "./campus-marketplace";

afterEach(cleanup);

describe("preview request selection", () => {
  it("clears the sample request before opening a different service", () => {
    render(<CampusMarketplace initialEntry="app" dataMode="preview" />);

    expect(screen.getByRole("heading", { name: "Calculus rescue session" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select Laptop tune-up & setup" }));
    fireEvent.click(screen.getByRole("button", { name: /Request help/ }));

    const drawer = screen.getByRole("dialog");
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByRole("heading", { name: "Laptop tune-up & setup" })).toBeInTheDocument();
    expect(within(drawer).getByText("What do you need?")).toBeInTheDocument();
    expect(screen.queryByText("Hi! Is the 4:30 PM slot still open?")).not.toBeInTheDocument();
  });
});

describe("motion preferences", () => {
  it("uses native instant scrolling when reduced motion is requested", () => {
    expect(chatScrollBehavior(true)).toBe("auto");
    expect(chatScrollBehavior(false)).toBe("smooth");
  });
});

describe("responsive safety affordances", () => {
  it("keeps compact filters and a non-truncating mobile recenter control", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const marketplace = readFileSync(resolve(process.cwd(), "src/components/campus-marketplace.tsx"), "utf8");
    expect(styles).toContain('grid-template-areas: "intro search" "intro cats" "offer filter-heading" "offer filters";');
    expect(styles).toContain(".filter-controls { grid-area: filters; grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(styles).toContain(".locate-label { display: none; }");
    expect(marketplace).toContain('aria-label="Recenter map"');
    expect(marketplace).toContain('disabled aria-disabled="true" title="Blocking controls are not available in this release"');
  });
});
