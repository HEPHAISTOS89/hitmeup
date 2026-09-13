// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATAR_MARKETPLACE_CATALOG } from "@/lib/avatar-marketplace-catalog";
import type { AvatarMarketplaceProjection, CosmeticProjection, ProfileProjection, RewardSummary } from "@/lib/types";
import avatarManifest from "../../public/avatar/laura/manifest.json";

const api = vi.hoisted(() => ({
  equipCosmetic: vi.fn(),
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

const rewards: RewardSummary = { balance: 120, lifetimeEarned: 120, lifetimeSpent: 0, unlockedSkus: [] };

function renderStudio(overrides: Partial<React.ComponentProps<typeof AvatarStudio>> = {}) {
  const onProfileChange = vi.fn();
  const onCatalogChange = vi.fn();
  render(<AvatarStudio profile={profile} catalog={catalog} catalogStatus="ready" previewMode={false} onProfileChange={onProfileChange} onCatalogChange={onCatalogChange} {...overrides} />);
  return { onProfileChange, onCatalogChange };
}

function openClassicEditor() {
  fireEvent.click(screen.getByText("Classic vector avatar"));
}

describe("Avatar Studio commerce boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.updateProfile.mockResolvedValue({ updated: true });
    api.getAvatarMarketplace.mockResolvedValue(marketplace);
    api.getRewards.mockResolvedValue(rewards);
    api.setAvatarMarketplaceItem.mockResolvedValue({ sku: "avatar.top.male.utility-overshirt", equipped: true });
    api.unlockWithRewardPoints.mockResolvedValue({ unlocked: "reward-frame-mint", rewards: { ...rewards, balance: 80, lifetimeSpent: 40, unlockedSkus: ["reward-frame-mint"] } });
    api.getCosmetics.mockResolvedValue(catalog);
    api.getCosmeticQuote.mockResolvedValue({ network: "devnet", productId: "profile-frame", label: "Profile frame", lamports: 10_000_000, treasury: "Treasury111", checkoutId: "00000000-0000-4000-8000-000000000001" });
  });

  it("saves only the six server-supported classic avatar fields", async () => {
    const { onProfileChange } = renderStudio();
    openClassicEditor();
    fireEvent.click(screen.getByRole("tab", { name: "Classic style" }));
    fireEvent.click(screen.getByRole("button", { name: "Tech jacket" }));
    fireEvent.click(screen.getByRole("button", { name: "Save look" }));

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ avatarConfig: {
      skin: "golden", face: "smile", hair: "curls", hairColor: "ink", outfit: "tech", accessory: "none",
    } }));
    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({ avatarConfig: expect.objectContaining({ outfit: "tech" }) }));
  });

  it("uses accessible keyboard tab patterns in both editors", async () => {
    renderStudio();
    const outfits = await screen.findByRole("tab", { name: "Outfits" });
    fireEvent.keyDown(outfits, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Face" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Face" })).toHaveAttribute("aria-labelledby", "laura-avatar-tab-expressions");

    openClassicEditor();
    const character = screen.getByRole("tab", { name: "Classic face" });
    fireEvent.keyDown(character, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Classic style" })).toHaveAttribute("aria-selected", "true");
  });

  it("ships a production-safe original vector pack for every customization choice", () => {
    expect(avatarManifest.source).toMatchObject({
      creator: "HitMeUp",
      licenseStatus: "approved",
      thirdPartyImageInputs: false,
    });
    expect(avatarManifest.characters).toHaveLength(54);
    expect(avatarManifest.accessories).toHaveLength(15);
    expect(avatarManifest.backgrounds).toHaveLength(12);
    expect([...avatarManifest.characters, ...avatarManifest.accessories].every((asset) => asset.file.endsWith(".svg"))).toBe(true);
    expect(JSON.stringify(avatarManifest)).not.toContain(".webp");
  });

  it("renders all 12 backdrops and respects a backend review gate", async () => {
    const reviewGatedMarketplace = marketplace.map((item) => ({
      ...item,
      assetStatus: item.sku === "avatar.background.burst" ? "placeholder" as const : "approved" as const,
    }));
    api.getAvatarMarketplace.mockResolvedValue(reviewGatedMarketplace);
    renderStudio();
    fireEvent.click(await screen.findByRole("tab", { name: "Backdrop" }));

    expect(screen.getByText("Server review gate")).toBeInTheDocument();
    expect(screen.getByText("Graphic backgrounds").parentElement).toHaveTextContent("6 styles");
    const panel = screen.getByRole("tabpanel", { name: "Backdrop" });
    expect(within(panel).getAllByRole("button")).toHaveLength(12);
    fireEvent.click(within(panel).getByRole("button", { name: "Noise burst, 0.05 SOL Devnet · preview only" }));
    expect(screen.getByText("PREVIEW IS NOT OWNERSHIP")).toBeInTheDocument();
    expect(api.setAvatarMarketplaceItem).not.toHaveBeenCalled();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it("does not expose legacy checkout for unknown catalog SKUs", async () => {
    renderStudio({ catalog: [...catalog, { sku: "unknown-premium-top", label: "Premium top", lamports: 8_000_000, owned: false, equipped: false, network: "devnet" }] });
    openClassicEditor();

    expect(screen.queryByText("Premium top")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Unlock on Devnet" })).toHaveLength(2);
  });

  it("previews legacy locked cosmetics but requests backend pricing before payment", async () => {
    renderStudio();
    openClassicEditor();
    expect(screen.getByText(/No real money:/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Unlock on Devnet" })[0]);

    await waitFor(() => expect(api.getCosmeticQuote).toHaveBeenCalledWith("profile-frame"));
    expect(await screen.findByText("Solana Devnet")).toBeInTheDocument();
    expect(screen.getByText("Wallet payment control")).toBeInTheDocument();
    expect(api.equipCosmetic).not.toHaveBeenCalled();
  });

  it("equips an approved included original item through PATCH and refreshes server state", async () => {
    const approvedMarketplace = marketplace.map((item) => item.sku === "avatar.top.male.utility-overshirt" ? { ...item, assetStatus: "approved" as const } : item);
    api.getAvatarMarketplace.mockResolvedValue(approvedMarketplace);
    renderStudio();

    fireEvent.click(await screen.findByRole("button", { name: "Utility overshirt, Owned" }));
    await waitFor(() => expect(api.setAvatarMarketplaceItem).toHaveBeenCalledWith("avatar.top.male.utility-overshirt", true));
    expect(api.getAvatarMarketplace).toHaveBeenCalledTimes(2);
  });

  it("unlocks an earned collectible with the server price, then equips it", async () => {
    renderStudio();
    fireEvent.click(await screen.findByRole("button", { name: "Mint circuit frame, 40 points" }));
    fireEvent.click(screen.getByRole("button", { name: "Unlock with points" }));

    await waitFor(() => expect(api.unlockWithRewardPoints).toHaveBeenCalledWith("reward-frame-mint"));
    expect(api.setAvatarMarketplaceItem).toHaveBeenCalledWith("reward-frame-mint", true);
    expect(screen.getByLabelText("HitMeUp points balance")).toHaveTextContent("80 points");
  });

  it("quotes the shared purchaseSku for an approved original premium visual", async () => {
    const approvedMarketplace = marketplace.map((item) => item.sku === "avatar.top.male.star-tee" ? { ...item, assetStatus: "approved" as const } : item);
    api.getAvatarMarketplace.mockResolvedValue(approvedMarketplace);
    api.getCosmeticQuote.mockResolvedValue({ network: "devnet", productId: "avatar-premium-collection", label: "Avatar premium collection", lamports: 50_000_000, treasury: "Treasury111", checkoutId: "00000000-0000-4000-8000-000000000001" });
    renderStudio();

    fireEvent.click(await screen.findByRole("button", { name: "Star tee, 0.05 SOL Devnet" }));
    fireEvent.click(screen.getByRole("button", { name: "Get exact Devnet quote" }));

    await waitFor(() => expect(api.getCosmeticQuote).toHaveBeenCalledWith("avatar-premium-collection"));
    expect(screen.getByText("Wallet payment control")).toBeInTheDocument();
    expect(api.setAvatarMarketplaceItem).not.toHaveBeenCalled();
  });
});
