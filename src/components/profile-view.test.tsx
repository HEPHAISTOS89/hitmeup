// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileProjection, ProfileReview, ServiceRequestSummary } from "@/lib/types";

vi.mock("./profile-avatar-link", () => ({
  ProfileAvatarLink: () => <a href="/avatar?preview=1" aria-label="Customize your avatar">Avatar</a>,
  ProfileAvatarPicture: () => <span>Avatar</span>,
}));

import { ProfileView } from "./campus-marketplace";

afterEach(cleanup);

const profile: ProfileProjection = {
  displayName: "Taylor Garcia", avatarUrl: null, bio: "Original About", eduDomain: "ttu.edu", solanaWallet: null,
  interests: ["Python"], avatarConfig: { skin: "golden", face: "smile", hair: "curls", hairColor: "ink", outfit: "hoodie", accessory: "none" },
  rating: 5, ratingCount: 1, completedCount: 2,
};
const requests: ServiceRequestSummary[] = [{
  id: "request", serviceId: "service", status: "closed", role: "provider", otherParty: { name: "Jordan Lee", initials: "JL" },
  service: { title: "Portfolio feedback", category: "Creative" }, createdAt: "2026-09-01T00:00:00Z", acceptedAt: null, closedAt: "2026-09-01T01:00:00Z",
  completion: { mine: true, theirs: true }, ratings: { mine: true, theirs: true }, location: { mine: false, theirs: false, expiresAt: null },
}];
const reviews: ProfileReview[] = [{ id: "review", score: 5, comment: "Thoughtful and on time.", createdAt: "2026-09-01T01:05:00Z", author: { name: "Jordan Lee", initials: "JL" }, service: { title: "Portfolio feedback" } }];

function renderProfile(onProfileChange = vi.fn()) {
  render(<ProfileView profile={profile} requests={requests} reviews={reviews} reviewsStatus="ready" previewMode onProfileChange={onProfileChange} onBack={() => undefined} onSettings={() => undefined} />);
  return onProfileChange;
}

describe("own profile preview", () => {
  it("links to the dedicated avatar editor and shows role-derived activity and received review", () => {
    renderProfile();
    expect(screen.getByRole("link", { name: "Customize your avatar" })).toHaveAttribute("href", "/avatar?preview=1");
    expect(screen.getByText("You provided")).toBeInTheDocument();
    expect(screen.getByText("Thoughtful and on time.")).toBeInTheDocument();
  });

  it("discards a preview draft on cancel and saves only when requested", async () => {
    const onProfileChange = renderProfile();
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    const about = await screen.findByPlaceholderText("A short introduction for students you work with");
    fireEvent.change(about, { target: { value: "Unsaved About" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onProfileChange).not.toHaveBeenCalled();
    expect(screen.getByText("Original About")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    fireEvent.change(await screen.findByPlaceholderText("A short introduction for students you work with"), { target: { value: "Saved preview About" } });
    fireEvent.click(screen.getByRole("button", { name: "Save in this preview" }));
    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({ bio: "Saved preview About" }));
    expect(screen.getByText("Updated in this local preview only.")).toBeInTheDocument();
  });
});
