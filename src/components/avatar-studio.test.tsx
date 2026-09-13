// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATAR_MARKETPLACE_CATALOG } from "@/lib/avatar-marketplace-catalog";
import type { AvatarMarketplaceProjection, CosmeticProjection, ProfileProjection, RewardSummary } from "@/lib/types";
import avatarManifest from "../../public/avatar/laura/manifest.json";

const api = vi.hoisted(() => ({
  getAvatarMarketplace: vi.fn(),
  getCosmeticQuote: vi.fn(),
  getCosmetics: vi.fn(),
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

import { AvatarStudio } from "./avatar-studio";

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

const catalog: CosmeticProjection[] = [
  { sku: "profile-frame", label: "Profile frame", lamports: 10_000_000, owned: false, equipped: false, network: "devnet" },
  { sku: "campus-theme", label: "Campus theme", lamports: 20_000_000, owned: false, equipped: false, network: "devnet" },
  { sku: "trust-badge", label: "Trust badge", lamports: 30_000_000, owned: true, equipped: false, network: "devnet" },
];

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

function renderStudio(overrides: Partial<React.ComponentProps<typeof AvatarStudio>> = {}) {
  const onProfileChange = vi.fn();
  const onCatalogChange = vi.fn();
  render(<AvatarStudio profile={profile} catalog={catalog} catalogStatus="ready" previewMode={false} onProfileChange={onProfileChange} onCatalogChange={onCatalogChange} {...overrides} />);
  return { onProfileChange, onCatalogChange };
}

async function openTab(name: "Identity" | "Outfits" | "Face" | "Extras" | "Backdrop") {
  fireEvent.click(await screen.findByRole("tab", { name }));
  return screen.getByRole("tabpanel", { name });
}

describe("Laura avatar studio with backend boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.updateProfile.mockResolvedValue({ updated: true });
    api.getAvatarMarketplace.mockResolvedValue(marketplace);
    api.getRewards.mockResolvedValue(rewards);
    api.setAvatarMarketplaceItem.mockResolvedValue({ sku: "avatar.top.male.utility-overshirt", equipped: true });
    api.unlockWithRewardPoints.mockResolvedValue({ unlocked: "reward-frame-mint", rewards: { ...rewards, balance: 80, lifetimeSpent: 90, unlockedSkus: ["reward-frame-mint"] } });
    api.getCosmetics.mockResolvedValue(catalog);
    api.getCosmeticQuote.mockResolvedValue({ network: "devnet", productId: "profile-frame", label: "Profile frame", lamports: 10_000_000, treasury: "Treasury111", checkoutId: "00000000-0000-4000-8000-000000000001" });
  });

  it("integrates inclusive identity choices into Laura's main editor and saves the existing six-field backend contract", async () => {
    const { onProfileChange } = renderStudio();
    const identity = await openTab("Identity");
    expect(within(identity).getByText("Identity is always included.")).toBeInTheDocument();
    fireEvent.click(within(identity).getByRole("button", { name: "Ebony" }));
    fireEvent.click(within(identity).getByRole("button", { name: "Locs" }));
    fireEvent.click(within(identity).getByRole("button", { name: "Violet" }));
    fireEvent.click(within(identity).getByRole("button", { name: "Save identity" }));

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ avatarConfig: {
      skin: "ebony", face: "smile", hair: "locs", hairColor: "violet", outfit: "hoodie", accessory: "none",
    } }));
    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({ avatarConfig: expect.objectContaining({ skin: "ebony", hair: "locs", hairColor: "violet" }) }));
    expect(screen.getByRole("img", { name: /Ebony skin tone and Locs hair/ })).toBeInTheDocument();
  });

  it("uses one accessible keyboard tab pattern and removes the duplicated classic editor", async () => {
    renderStudio();
    const identity = await screen.findByRole("tab", { name: "Identity" });
    fireEvent.keyDown(identity, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Outfits" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Outfits" }), { key: "ArrowRight" });
    expect(screen.getByRole("tabpanel", { name: "Face" })).toHaveAttribute("aria-labelledby", "laura-avatar-tab-expressions");
    expect(screen.queryByText("Classic vector avatar")).not.toBeInTheDocument();
    expect(screen.queryByText("Profile frame")).not.toBeInTheDocument();
    expect(screen.queryByText("Campus theme")).not.toBeInTheDocument();
  });

  it("ships a production-safe original vector pack for every Laura customization choice", () => {
    expect(avatarManifest.source).toMatchObject({ creator: "HitMeUp", licenseStatus: "approved", thirdPartyImageInputs: false });
    expect(avatarManifest.characters).toHaveLength(54);
    expect(avatarManifest.accessories).toHaveLength(15);
    expect(avatarManifest.backgrounds).toHaveLength(12);
    expect([...avatarManifest.characters, ...avatarManifest.accessories].every((asset) => asset.file.endsWith(".svg"))).toBe(true);
    expect(JSON.stringify(avatarManifest)).not.toContain(".webp");
  });

  it("renders all 12 backdrops and respects the backend review gate", async () => {
    const reviewGatedMarketplace = marketplace.map((item) => ({ ...item, assetStatus: item.sku === "avatar.background.burst" ? "placeholder" as const : "approved" as const }));
    api.getAvatarMarketplace.mockResolvedValue(reviewGatedMarketplace);
    renderStudio();
    const panel = await openTab("Backdrop");

    expect(screen.getByText("Server review gate")).toBeInTheDocument();
    expect(screen.getByText("Graphic backgrounds").parentElement).toHaveTextContent("6 styles");
    expect(within(panel).getAllByRole("button")).toHaveLength(12);
    fireEvent.click(within(panel).getByRole("button", { name: "Noise burst, 0.05 SOL Devnet · preview only" }));
    expect(screen.getByText("PREVIEW IS NOT OWNERSHIP")).toBeInTheDocument();
    expect(api.setAvatarMarketplaceItem).not.toHaveBeenCalled();
  });

  it("equips an approved included Laura item through the backend and refreshes state", async () => {
    const approvedMarketplace = marketplace.map((item) => item.sku === "avatar.top.male.utility-overshirt" ? { ...item, assetStatus: "approved" as const } : item);
    api.getAvatarMarketplace.mockResolvedValue(approvedMarketplace);
    renderStudio();
    const outfits = await openTab("Outfits");

    fireEvent.click(within(outfits).getByRole("button", { name: "Utility overshirt, Owned" }));
    await waitFor(() => expect(api.setAvatarMarketplaceItem).toHaveBeenCalledWith("avatar.top.male.utility-overshirt", true));
    expect(api.getAvatarMarketplace).toHaveBeenCalledTimes(2);
  });

  it("explains the complete reward contract and unlocks with the server price", async () => {
    renderStudio();
    expect(await screen.findByText("Both confirm completion")).toBeInTheDocument();
    expect(screen.getByText(/each student receives 5 stars \/ 50 points/)).toBeInTheDocument();
    expect(screen.getByText(/3 rewarded services per student per UTC day/)).toBeInTheDocument();
    expect(screen.getByText(/Rating quality never changes the reward/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mint circuit frame, 4 reward stars · 40 points" }));
    fireEvent.click(screen.getByRole("button", { name: "Unlock with stars" }));

    await waitFor(() => expect(api.unlockWithRewardPoints).toHaveBeenCalledWith("reward-frame-mint"));
    expect(api.setAvatarMarketplaceItem).toHaveBeenCalledWith("reward-frame-mint", true);
    expect(screen.getByLabelText(/80 HitMeUp points/)).toHaveTextContent("8 stars 80 points");
  });

  it("reports ownership success separately when reward equipment fails", async () => {
    api.setAvatarMarketplaceItem.mockRejectedValueOnce(new Error("equip failed"));
    renderStudio();
    fireEvent.click(await screen.findByRole("button", { name: "Mint circuit frame, 4 reward stars · 40 points" }));
    fireEvent.click(screen.getByRole("button", { name: "Unlock with stars" }));

    expect(await screen.findByText(/is unlocked and owned. Equipping did not finish/)).toBeInTheDocument();
  });

  it("quotes the shared purchase SKU for one premium bundle rather than charging per tile", async () => {
    const approvedMarketplace = marketplace.map((item) => item.sku === "avatar.top.male.star-tee" ? { ...item, assetStatus: "approved" as const } : item);
    api.getAvatarMarketplace.mockResolvedValue(approvedMarketplace);
    api.getCosmeticQuote.mockResolvedValue({ network: "devnet", productId: "avatar-premium-collection", label: "Avatar premium collection", lamports: 50_000_000, treasury: "Treasury111", checkoutId: "00000000-0000-4000-8000-000000000001" });
    renderStudio();
    const outfits = await openTab("Outfits");

    fireEvent.click(within(outfits).getByRole("button", { name: "Star tee, 0.05 SOL Devnet" }));
    expect(screen.getByText("One bundle, not one charge per item.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Get exact Devnet quote" }));

    await waitFor(() => expect(api.getCosmeticQuote).toHaveBeenCalledWith("avatar-premium-collection"));
    expect(screen.getByText("Wallet payment control")).toBeInTheDocument();
    expect(api.setAvatarMarketplaceItem).not.toHaveBeenCalled();
  });
});
