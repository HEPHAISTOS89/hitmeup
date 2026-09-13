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

import { CampusMarketplace, CreateServiceModal, chatScrollBehavior, requestForProjection } from "./campus-marketplace";
import { RatingGate } from "./rating-gate";
import type { ServiceRequestSummary } from "@/lib/types";

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
    const summary = screen.getByRole("article", { name: "Coffee, snacks, and study tables listing summary" });
    expect(summary).toHaveTextContent("Businesses");
    expect(within(summary).getByRole("button", { name: "Business details" })).toBeInTheDocument();
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
    fireEvent.click(within(screen.getByRole("article", { name: "I need a USB-C charger for an hour listing summary" })).getByRole("button", { name: "Request help" }));

    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByRole("heading", { name: "I need a USB-C charger for an hour" })).toBeInTheDocument();
    expect(within(drawer).getByText("What do you need?")).toBeInTheDocument();
    expect(screen.queryByText("Hi! Is the 4:30 PM slot still open?")).not.toBeInTheDocument();
  });

  it("shows every request in a searchable private inbox and opens the selected conversation", () => {
    render(<CampusMarketplace initialEntry="app" dataMode="preview" />);

    fireEvent.click(screen.getByRole("button", { name: /^Requests/i }));
    expect(screen.getByRole("heading", { name: "Messages & requests" })).toBeInTheDocument();
    expect(screen.getByLabelText("1 active and 2 past requests")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Calculus rescue session with Maya Chen/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /History 2/i }));
    expect(screen.getByRole("button", { name: /Portfolio feedback with Jordan Lee/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Laptop setup with Nina Brooks/i })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search conversations" }), { target: { value: "Jordan" } });
    expect(screen.queryByRole("button", { name: /Laptop setup with Nina Brooks/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Portfolio feedback with Jordan Lee/i }));
    expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Portfolio feedback" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("This conversation is read-only.")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
  });

  it("supports arrow-key navigation between request tabs", () => {
    render(<CampusMarketplace initialEntry="app" dataMode="preview" />);
    fireEvent.click(screen.getByRole("button", { name: /^Requests/i }));

    const activeTab = screen.getByRole("tab", { name: /Active 1/i });
    fireEvent.keyDown(activeTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /History 2/i })).toHaveAttribute("aria-selected", "true");
  });
});

describe("required rating projection", () => {
  const request = (id: string, status: ServiceRequestSummary["status"], mine = false): ServiceRequestSummary => ({
    id,
    serviceId: `service-${id}`,
    status,
    role: "requester",
    otherParty: { name: `Student ${id}`, initials: id.slice(0, 2).toUpperCase() },
    service: { title: `Service ${id}`, category: "Tutoring" },
    createdAt: "2026-09-13T10:00:00-05:00",
    acceptedAt: null,
    closedAt: null,
    completion: { mine: status === "rating_pending", theirs: status === "rating_pending" },
    ratings: { mine, theirs: false },
    location: { mine: false, theirs: false, expiresAt: null },
  });

  it("prioritizes an unrated completed service over the currently selected request", () => {
    const selected = request("selected", "requested");
    const pending = request("pending", "rating_pending");

    expect(requestForProjection([selected, pending], selected)).toBe(pending);
  });

  it("keeps the preferred request when every required rating was submitted", () => {
    const selected = request("selected", "requested");
    const rated = request("rated", "rating_pending", true);

    expect(requestForProjection([selected, rated], selected)).toBe(selected);
  });

  it("keeps access gated until an explicit valid rating is submitted", () => {
    const submit = vi.fn();
    const { rerender } = render(<RatingGate name="Maya" value={0} onChange={vi.fn()} onSubmit={submit} busy={false} />);

    expect(screen.getByRole("dialog", { name: "One last thing." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit rating & continue" })).toBeDisabled();

    rerender(<RatingGate name="Maya" value={5} onChange={vi.fn()} onSubmit={submit} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit rating & continue" }));
    expect(submit).toHaveBeenCalledOnce();
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

  it("keeps filters and notifications reachable on mobile", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const marketplace = readFileSync(resolve(process.cwd(), "src/components/campus-marketplace.tsx"), "utf8");
    expect(styles).toContain(".mobile-notifications-button { display: inline-flex;");
    expect(styles).toContain(".discover-frame .filter-controls { display: grid; grid-template-columns: 1fr 1fr;");
    expect(marketplace).toContain('className="mobile-notifications-button"');
    expect(marketplace).toContain("notificationsStatus === \"loading\"");
  });
});

describe("live marketplace wiring", () => {
  it("forwards duration and subcategory filters and keeps Gemini's exact subtype", () => {
    const marketplace = readFileSync(resolve(process.cwd(), "src/components/campus-marketplace.tsx"), "utf8");
    expect(marketplace).toContain('listingKind: listingFilter === "all" ? undefined : listingFilter');
    expect(marketplace).toContain("item.label === suggestion.subcategory");
  });

  it("uses the authenticated server recommendation order for the default discovery view", () => {
    const marketplace = readFileSync(resolve(process.cwd(), "src/components/campus-marketplace.tsx"), "utf8");
    expect(marketplace).toContain("? getRecommendations()");
    expect(marketplace).toContain("serverRecommendations[right.id]?.score");
    expect(marketplace).toContain("explanation: recommendation.explanation");
    expect(marketplace).toContain("profileInterestKey");
    expect(marketplace).toContain("setRecommendationRefreshKey");
  });

  it("subscribes to participant-safe live notifications, requests and approximate services", () => {
    const marketplace = readFileSync(resolve(process.cwd(), "src/components/campus-marketplace.tsx"), "utf8");
    expect(marketplace).toContain('new EventSource("/api/data/live?topics=notifications,requests,services"');
    expect(marketplace).toContain('source.addEventListener("notifications"');
    expect(marketplace).toContain('source.addEventListener("requests"');
    expect(marketplace).toContain('source.addEventListener("services"');
    expect(marketplace).toContain("normalizeServiceSnapshot(payload.services)");
  });
});

describe("Gemini-assisted campus discovery", () => {
  it("turns a sentence into visible map filters in preview without replacing manual search", () => {
    render(<CampusMarketplace initialEntry="app" dataMode="preview" />);

    const prompt = screen.getByRole("textbox", { name: "Describe what you need for Gemini" });
    fireEvent.change(prompt, { target: { value: "Calculus help within 2 miles, 4.5+, today" } });
    fireEvent.click(screen.getByRole("button", { name: /Find/i }));

    expect(screen.getByRole("status")).toHaveTextContent("Tutoring · Exam prep · within 2 mi · 4.5+ · today");
    expect(screen.getByRole("group", { name: "Tutoring / Academic subcategories" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search listings" })).toHaveValue("calculus");
    expect(screen.queryByText("Turn one sentence into map filters.")).not.toBeInTheDocument();
    expect(screen.queryByText("What Gemini receives")).not.toBeInTheDocument();
  });

  it("keeps the removed match-explanation card out of the main map", () => {
    render(<CampusMarketplace initialEntry="app" dataMode="preview" />);
    expect(screen.queryByRole("complementary", { name: "Selected listing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Why this/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Student email required")).not.toBeInTheDocument();
  });

  it("shows the richer listing review before the user can publish", () => {
    render(<CampusMarketplace initialEntry="app" dataMode="preview" />);
    fireEvent.click(screen.getByRole("button", { name: /Post something temporary/i }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Suggest" }));
    expect(screen.getByRole("region", { name: "Writing assistant review" })).toHaveTextContent("Structured and ready to review");
    expect(screen.getByRole("region", { name: "Writing assistant review" })).toHaveTextContent("calculus");
  });
});

describe("temporary listing submission feedback", () => {
  const validDraft = {
    title: "Demo calculus walkthrough",
    category: "Tutoring" as const,
    subcategory: "Exam prep",
    availability: "Today · 30 minutes",
    description: "A focused review of integration techniques before the exam.",
    price: "Free demo",
  };

  function renderCreateModal({ submitError = "", submitting = false } = {}) {
    return render(
      <CreateServiceModal
        draft={validDraft}
        setDraft={vi.fn()}
        reviewed
        setReviewed={vi.fn()}
        assistantBusy={false}
        assistantError=""
        assistantDetails={null}
        submitError={submitError}
        submitting={submitting}
        requiresGeminiConsent={false}
        onAssistant={vi.fn()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  }

  it("keeps a geolocation failure visible inside the active dialog", () => {
    renderCreateModal({ submitError: "Allow location once to publish an approximate campus pin." });

    const dialog = screen.getByRole("dialog", { name: "Make one useful thing findable." });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Allow location once");
    expect(within(dialog).getByRole("button", { name: /Publish offer/i })).toBeEnabled();
  });

  it("prevents duplicate submissions while a listing is publishing", () => {
    renderCreateModal({ submitting: true });

    const dialog = screen.getByRole("dialog", { name: "Make one useful thing findable." });
    expect(within(dialog).getByRole("button", { name: /Publishing/i })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("shows the exact Gemini payload fields and requires explicit consent", () => {
    const onAssistant = vi.fn();
    render(<CreateServiceModal draft={validDraft} setDraft={vi.fn()} reviewed setReviewed={vi.fn()} assistantBusy={false} assistantError="" assistantDetails={null} submitError="" submitting={false} requiresGeminiConsent onAssistant={onAssistant} onSubmit={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Make one useful thing findable." });
    expect(within(dialog).getByText("What Gemini receives")).toBeInTheDocument();
    expect(within(dialog).getAllByText(validDraft.description)).toHaveLength(2);
    const suggest = within(dialog).getByRole("button", { name: "Suggest" });
    expect(suggest).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Send these fields to Gemini/i }));
    expect(suggest).toBeEnabled();
    fireEvent.click(suggest);
    expect(onAssistant).toHaveBeenCalledOnce();
  });

  it("describes exact-location consent as access to the service meeting point", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/campus-marketplace.tsx"), "utf8");
    expect(source).toContain("Allow both participants to view this service&apos;s exact meeting point");
    expect(source).not.toContain("Share my exact location for this service");
  });
});

describe("motion preferences", () => {
  it("uses instant chat scrolling when reduced motion is requested", () => {
    expect(chatScrollBehavior(true)).toBe("auto");
    expect(chatScrollBehavior(false)).toBe("smooth");
  });
});
