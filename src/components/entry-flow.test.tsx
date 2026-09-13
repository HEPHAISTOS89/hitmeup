// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateProfile } = vi.hoisted(() => ({ updateProfile: vi.fn(async () => ({ updated: true })) }));

vi.mock("@/lib/client-api", () => ({
  ApiError: class ApiError extends Error {},
  updateProfile,
}));

import { EntryFlow } from "./entry-flow";

describe("authenticated onboarding", () => {
  beforeEach(() => {
    updateProfile.mockClear();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: vi.fn() },
    });
  });

  afterEach(() => vi.restoreAllMocks());
  afterEach(cleanup);

  it("keeps the verified Microsoft route and privacy proofs in the redesigned login", () => {
    render(<EntryFlow initialEntry="login" onComplete={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Continue with Microsoft/ })).toHaveAttribute("href", "/auth/login?returnTo=/app");
    expect(screen.getByText("University sign-in gates the network.")).toBeInTheDocument();
    expect(screen.getByText("Exact sharing is voluntary and service-scoped.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
  });

  it("persists the chosen profile fields before advancing to location", async () => {
    const onComplete = vi.fn();
    render(<EntryFlow initialEntry="profile" onComplete={onComplete} />);

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Alex Rivera" } });
    fireEvent.change(screen.getByLabelText("Program or area of study"), { target: { value: "Computer science" } });
    fireEvent.change(screen.getByLabelText("Short introduction"), { target: { value: "I can help with debugging." } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({
      displayName: "Alex Rivera",
      bio: "I can help with debugging.",
      interests: ["Computer science"],
    }));
    expect(await screen.findByRole("heading", { name: "Nearby, not pinpointed." })).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("requests real browser location permission and has an explicit fallback", async () => {
    const onComplete = vi.fn();
    const getCurrentPosition = vi.mocked(navigator.geolocation.getCurrentPosition);
    render(<EntryFlow initialEntry="privacy" onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: "Allow location" }));
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    const failure = getCurrentPosition.mock.calls[0]?.[1];
    failure?.({ code: 1, message: "permission denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    expect(await screen.findByText(/Location is off/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue without location" }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
