import { describe, expect, it, vi } from "vitest";
import { claimCosmeticUnlock, getRewardSummary, listAvatarMarketplace, reserveCosmeticQuote, setAvatarCosmetic, unlockRewardCosmetic } from "./repository";

describe("avatar marketplace repository", () => {
  it("maps the full server catalog contract", async () => {
    const rpc = vi.fn(async () => ({ data: [{
      sku: "reward-frame-solar", label: "Solar circuit frame", category: "frame", value_key: "solar",
      equip_group: "frame", collections: ["male", "female"], unlock_method: "reward_points",
      purchase_sku: null, lamports: 0, reward_points: 60, owned: false, equipped: false,
      network: null, asset_status: "placeholder",
    }], error: null }));
    await expect(listAvatarMarketplace({ rpc } as never)).resolves.toEqual([{
      sku: "reward-frame-solar", label: "Solar circuit frame", category: "frame", value: "solar",
      equipGroup: "frame", collections: ["male", "female"], unlockMethod: "reward_points",
      purchaseSku: null, lamports: 0, rewardPoints: 60, owned: false, equipped: false,
      network: null, assetStatus: "placeholder",
    }]);
    expect(rpc).toHaveBeenCalledWith("list_my_avatar_marketplace");
  });

  it("equips and unequips only through the checked current-subject RPC", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await setAvatarCosmetic({ rpc } as never, "avatar.accessory.frames", false);
    expect(rpc).toHaveBeenCalledWith("set_my_avatar_cosmetic", { target_sku: "avatar.accessory.frames", target_equipped: false });
  });

  it("reads the subject reward summary and sends no client-authored point amount", async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === "get_my_reward_summary" ? [{ balance: 50, lifetime_earned: 100, lifetime_spent: 50, unlocked_skus: ["reward-frame-solar"] }] : true, error: null }));
    await expect(getRewardSummary({ rpc } as never)).resolves.toEqual({ balance: 50, lifetimeEarned: 100, lifetimeSpent: 50, unlockedSkus: ["reward-frame-solar"] });
    await unlockRewardCosmetic({ rpc } as never, "reward-frame-solar");
    expect(rpc).toHaveBeenLastCalledWith("unlock_my_avatar_reward", { target_sku: "reward-frame-solar" });
  });

  it("binds a paid claim to the server reservation and verified amount", async () => {
    const quoteId = "00000000-0000-4000-8000-000000000001";
    const rpc = vi.fn(async (name: string) => ({ data: name === "reserve_profile_purchase_quote" ? quoteId : "customization-id", error: null }));
    await expect(reserveCosmeticQuote({ rpc } as never, "auth0|student", "profile-frame", 10_000_000, "00000000-0000-4000-8000-000000000002")).resolves.toBe(quoteId);
    await expect(claimCosmeticUnlock(
      { rpc } as never,
      "auth0|student",
      "profile-frame",
      "5".repeat(88),
      "Vote111111111111111111111111111111111111111",
      10_000_000,
      quoteId,
    )).resolves.toBe("customization-id");
    expect(rpc).toHaveBeenLastCalledWith("claim_profile_customization", expect.objectContaining({
      target_lamports: 10_000_000,
      target_quote_id: quoteId,
    }));
  });
});
