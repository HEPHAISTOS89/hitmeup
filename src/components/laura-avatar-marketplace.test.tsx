// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATAR_MARKETPLACE_CATALOG } from "@/lib/avatar-marketplace-catalog";
import type { AvatarMarketplaceProjection, ProfileProjection, RewardSummary } from "@/lib/types";
import avatarManifest from "../../public/avatar/laura/manifest.json";

const api = vi.hoisted(() => ({
  getAvatarMarketplace: vi.fn(),
  getCosmeticQuote: vi.fn(),
  getRewards: vi.fn(),
  setAvatarMarketplaceItem: vi.fn(),
  unlockCosmetic: vi.fn(),
  unlockWithRewardPoints: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("@/lib/client-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/client-api")>("@/lib/client-api");
  return { ...actual, ...api };
});
vi.mock("./solana-wallet-pay", () => ({ SolanaWalletPay: () => <div>Wallet payment control</div> }));

import { LauraAvatarMarketplace } from "./laura-avatar-marketplace";

afterEach(cleanup);

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

const marketplace: AvatarMarketplaceProjection[] = AVATAR_MARKETPLACE_CATALOG.map((item) => ({
  sku: item.sku,
  label: item.label,
  category: item.category,
  value: item.value,
  equipGroup: item.equipGroup,
  collections: [...item.collections],
  unlockMethod: item.unlockMethod,
  purchaseSku: item.purchaseSku,
  lamports: item.lamports,
  rewardPoints: item.rewardPoints,
  owned: item.unlockMethod === "included",
  equipped: false,
  network: item.unlockMethod === "solana_devnet" ? "devnet" : null,
  assetStatus: item.assetStatus,
}));

const rewards: RewardSummary = { balance: 120, lifetimeEarned: 170, lifetimeSpent: 50, unlockedSkus: [] };

function renderMarketplace(overrides: Partial<React.ComponentProps<typeof LauraAvatarMarketplace>> = {}) {
  const onProfileChange = vi.fn();
  render(<LauraAvatarMarketplace profile={profile} previewMode={false} onProfileChange={onProfileChange} {...overrides} />);
  return { onProfileChange };
}

async function openTab(name: "Outfits" | "Face" | "Extras" | "Backdrop") {
  fireEvent.click(await screen.findByRole("tab", { name }));
  return screen.getByRole("tabpanel", { name });
}

describe("Laura avatar marketplace with backend boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.updateProfile.mockResolvedValue({ updated: true });
    api.getAvatarMarketplace.mockResolvedValue(marketplace);
    api.getRewards.mockResolvedValue(rewards);
    api.setAvatarMarketplaceItem.mockResolvedValue({ sku: "avatar.top.male.utility-overshirt", equipped: true });
    api.unlockWithRewardPoints.mockResolvedValue({ unlocked: "avatar.accessory.beanie", rewards: { ...rewards, balance: 80, lifetimeSpent: 90, unlockedSkus: ["avatar.accessory.beanie"] } });
    api.getCosmeticQuote.mockResolvedValue({ network: "devnet", productId: "avatar-premium-collection", label: "Avatar premium collection", lamports: 50_000_000, treasury: "Treasury111", checkoutId: "00000000-0000-4000-8000-000000000001" });
  });

  it("renders Laura's actual raster artwork and does not expose fake identity controls", async () => {
    renderMarketplace();
    await screen.findByRole("tab", { name: "Outfits" });
    expect(screen.queryByRole("tab", { name: "Identity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ebony" })).not.toBeInTheDocument();
    const preview = screen.getByRole("img", { name: /male avatar wearing/ });
    expect(preview.querySelector("img")?.getAttribute("src")).toContain("%2Favatar%2Flaura%2Fcharacters%2Fmale-t0-b0-default.png");
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it("keeps reset and shuffle as local previews without changing backend ownership", async () => {
    renderMarketplace({ previewMode: true });
    const outfits = await openTab("Outfits");
    fireEvent.click(within(outfits).getByRole("button", { name: "Utility overshirt, Owned" }));
    expect(screen.getAllByText("Preview only").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Reset preview" }));
    expect(screen.getByText(/Preview reset to your backend loadout/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Shuffle owned" }));
    expect(screen.getByText(/Shuffled an owned-art preview/)).toBeInTheDocument();
    expect(api.setAvatarMarketplaceItem).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Download PNG" })).toBeEnabled();
  });

  it("uses one accessible keyboard tab pattern and removes the duplicated classic editor", async () => {
    renderMarketplace();
    const outfits = await screen.findByRole("tab", { name: "Outfits" });
    fireEvent.keyDown(outfits, { key: "ArrowRight" });
    expect(screen.getByRole("tabpanel", { name: "Face" })).toHaveAttribute("aria-labelledby", "laura-avatar-tab-expressions");
    expect(screen.queryByText("Classic vector avatar")).not.toBeInTheDocument();
    expect(screen.queryByText("Profile frame")).not.toBeInTheDocument();
    expect(screen.queryByText("Campus theme")).not.toBeInTheDocument();
    expect(screen.queryByText("Trust badge")).not.toBeInTheDocument();
    expect(screen.queryByText("Mint circuit frame")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rewards" })).toBeInTheDocument();
    expect(screen.queryByText(/Laura/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Night beanie, 4 reward stars · 40 points" })).toBeInTheDocument();
  });

  it("ships actual Laura raster cut-outs for every artwork choice", () => {
    expect(avatarManifest.source).toMatchObject({ creator: "Laura", licenseStatus: "project-supplied", thirdPartyImageInputs: true, gitRef: "refs/remotes/cursor-source/merge-laura-avatar-marketplace-616f" });
    expect(avatarManifest.characters).toHaveLength(54);
    expect(avatarManifest.accessories).toHaveLength(15);
    expect(avatarManifest.backgrounds).toHaveLength(12);
    expect([...avatarManifest.characters, ...avatarManifest.accessories].every((asset) => asset.file.endsWith(".png") && Boolean(asset.sourceAtlas) && /^[a-f0-9]{64}$/.test(asset.sha256))).toBe(true);
    expect(Object.keys(avatarManifest.source.sourceSha256)).toHaveLength(9);
    expect(JSON.stringify(avatarManifest)).not.toContain("procedural SVG");
  });

  it("renders all 12 backdrops and respects the backend review gate", async () => {
    const reviewGatedMarketplace = marketplace.map((item) => ({ ...item, assetStatus: item.sku === "avatar.background.burst" ? "placeholder" as const : "approved" as const }));
    api.getAvatarMarketplace.mockResolvedValue(reviewGatedMarketplace);
    renderMarketplace();
    const panel = await openTab("Backdrop");

    expect(screen.getByRole("note")).toHaveTextContent("Some items are not available to equip yet.");
    expect(screen.getByText("Graphic backgrounds").parentElement).toHaveTextContent("6 styles");
    expect(within(panel).getAllByRole("button")).toHaveLength(12);
    fireEvent.click(within(panel).getByRole("button", { name: "Noise burst, 0.05 SOL Devnet · preview only" }));
    expect(screen.getAllByText("Preview only").length).toBeGreaterThan(0);
    expect(api.setAvatarMarketplaceItem).not.toHaveBeenCalled();
  });

  it("equips an approved included Laura item through the backend and refreshes state", async () => {
    const approvedMarketplace = marketplace.map((item) => item.sku === "avatar.top.male.utility-overshirt" ? { ...item, assetStatus: "approved" as const } : item);
    api.getAvatarMarketplace.mockResolvedValue(approvedMarketplace);
    renderMarketplace();
    const outfits = await openTab("Outfits");

    fireEvent.click(within(outfits).getByRole("button", { name: "Utility overshirt, Owned" }));
    await waitFor(() => expect(api.setAvatarMarketplaceItem).toHaveBeenCalledWith("avatar.top.male.utility-overshirt", true));
    expect(api.getAvatarMarketplace).toHaveBeenCalledTimes(2);
  });

  it("explains the complete reward contract and unlocks with the server price", async () => {
    renderMarketplace();
    expect(await screen.findByText(/Complete a service and both leave a review to earn 5 stars/)).toBeInTheDocument();
    expect(screen.getByText(/Limit: 3 rewarded services per day/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Night beanie, 4 reward stars · 40 points" }));
    fireEvent.click(screen.getByRole("button", { name: "Unlock with stars" }));

    await waitFor(() => expect(api.unlockWithRewardPoints).toHaveBeenCalledWith("avatar.accessory.beanie"));
    expect(api.setAvatarMarketplaceItem).toHaveBeenCalledWith("avatar.accessory.beanie", true);
    expect(screen.getByLabelText(/80 HitMeUp points/)).toHaveTextContent("8 stars 80 points");
  });

  it("reports ownership success separately when reward equipment fails", async () => {
    api.setAvatarMarketplaceItem.mockRejectedValueOnce(new Error("equip failed"));
    renderMarketplace();
    fireEvent.click(await screen.findByRole("button", { name: "Night beanie, 4 reward stars · 40 points" }));
    fireEvent.click(screen.getByRole("button", { name: "Unlock with stars" }));

    expect(await screen.findByText(/is unlocked and owned. Equipping did not finish/)).toBeInTheDocument();
  });

  it("quotes the shared purchase SKU for one premium bundle rather than charging per tile", async () => {
    const approvedMarketplace = marketplace.map((item) => item.sku === "avatar.top.male.star-tee" ? { ...item, assetStatus: "approved" as const } : item);
    api.getAvatarMarketplace.mockResolvedValue(approvedMarketplace);
    api.getCosmeticQuote.mockResolvedValue({ network: "devnet", productId: "avatar-premium-collection", label: "Avatar premium collection", lamports: 50_000_000, treasury: "Treasury111", checkoutId: "00000000-0000-4000-8000-000000000001" });
    renderMarketplace();
    const outfits = await openTab("Outfits");

    fireEvent.click(within(outfits).getByRole("button", { name: "Star tee, 0.05 SOL Devnet" }));
    expect(screen.getByText("One bundle, not one charge per item.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Get exact Devnet quote" }));

    await waitFor(() => expect(api.getCosmeticQuote).toHaveBeenCalledWith("avatar-premium-collection"));
    expect(screen.getByText("Wallet payment control")).toBeInTheDocument();
    expect(api.setAvatarMarketplaceItem).not.toHaveBeenCalled();
  });
});
