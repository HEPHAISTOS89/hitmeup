// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock("@/lib/client-api", () => ({
  ApiError: class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } },
  getSession: api.getSession,
  getProfile: api.getProfile,
}));

vi.mock("./campus-marketplace", () => ({
  CampusMarketplace: (props: { initialEntry: string; dataMode: string; initialView?: string }) => <div data-testid="marketplace-entry" data-mode={props.dataMode} data-view={props.initialView}>{props.initialEntry}</div>,
}));

import { AppGate } from "./app-gate";

const completeProfile = {
  displayName: "Alex Rivera", avatarUrl: null, bio: "Ready to help.", eduDomain: "ttu.edu", solanaWallet: null,
  interests: ["Computer science"], avatarConfig: { skin: "golden", face: "smile", hair: "curls", hairColor: "ink", outfit: "hoodie", accessory: "none" },
  rating: null, ratingCount: 0, completedCount: 0,
};

describe("app authentication gate", () => {
  beforeEach(() => {
    api.getSession.mockResolvedValue({ authenticated: true, user: { verified: true, eduDomain: "ttu.edu" } });
    api.getProfile.mockResolvedValue(completeProfile);
  });

  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("routes a newly provisioned default profile into onboarding", async () => {
    api.getProfile.mockResolvedValue({ ...completeProfile, displayName: "Student", bio: null, interests: [] });
    render(<AppGate />);
    expect(await screen.findByTestId("marketplace-entry")).toHaveTextContent("profile");
  });

  it("opens the marketplace only after an existing profile is confirmed", async () => {
    render(<AppGate />);
    await waitFor(() => expect(screen.getByTestId("marketplace-entry")).toHaveTextContent("app"));
    expect(screen.getByTestId("marketplace-entry")).toHaveAttribute("data-mode", "live");
  });

  it("preserves a deep-linked view in authenticated preview mode", () => {
    render(<AppGate preview initialView="requests" />);

    expect(screen.getByTestId("marketplace-entry")).toHaveAttribute("data-mode", "preview");
    expect(screen.getByTestId("marketplace-entry")).toHaveAttribute("data-view", "requests");
    expect(api.getSession).not.toHaveBeenCalled();
  });
});
