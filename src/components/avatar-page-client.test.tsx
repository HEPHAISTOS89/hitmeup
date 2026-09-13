// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileProjection } from "@/lib/types";

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock("@/lib/client-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/client-api")>("@/lib/client-api");
  return { ...actual, ...api };
});
vi.mock("./laura-avatar-marketplace", () => ({
  LauraAvatarMarketplace: ({ profile }: { profile: ProfileProjection | null }) => <div>Laura marketplace for {profile?.displayName}</div>,
}));
vi.mock("./hitmeup-logo", () => ({ HitMeUpLogo: () => <span>HitMeUp</span> }));

import { AvatarPageClient } from "./avatar-page-client";

const profile: ProfileProjection = {
  displayName: "Taylor Garcia",
  avatarUrl: null,
  bio: null,
  eduDomain: "ttu.edu",
  solanaWallet: null,
  interests: [],
  avatarConfig: { skin: "golden", face: "smile", hair: "curls", hairColor: "ink", outfit: "hoodie", accessory: "none" },
  rating: null,
  ratingCount: 0,
  completedCount: 0,
};

afterEach(cleanup);

describe("avatar page gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getSession.mockResolvedValue({ authenticated: true });
    api.getProfile.mockResolvedValue(profile);
  });

  it("opens the Laura editor from session and profile truth without a retired cosmetics request", async () => {
    render(<AvatarPageClient />);
    expect(await screen.findByText("Laura marketplace for Taylor Garcia")).toBeInTheDocument();
    expect(api.getSession).toHaveBeenCalledTimes(1);
    expect(api.getProfile).toHaveBeenCalledTimes(1);
  });

  it("keeps profile load failure explicit and leaves the editor closed", async () => {
    api.getProfile.mockRejectedValue(new Error("profile unavailable"));
    render(<AvatarPageClient />);
    expect(await screen.findByRole("heading", { name: "Your avatar is temporarily unavailable." })).toBeInTheDocument();
    expect(screen.queryByText(/Laura marketplace for/)).not.toBeInTheDocument();
  });
});
