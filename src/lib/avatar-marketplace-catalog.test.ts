import { describe, expect, it } from "vitest";
import { AVATAR_MARKETPLACE_CATALOG, SOLANA_AVATAR_PRODUCTS, getSolanaAvatarProduct } from "./avatar-marketplace-catalog";
import { getCosmeticQuote } from "./integrations/solana";

describe("avatar marketplace catalog", () => {
  it("uses unique stable SKUs and deterministic sort positions", () => {
    expect(AVATAR_MARKETPLACE_CATALOG).toHaveLength(51);
    expect(new Set(AVATAR_MARKETPLACE_CATALOG.map((item) => item.sku)).size).toBe(51);
    expect(new Set(AVATAR_MARKETPLACE_CATALOG.map((item) => item.sortOrder)).size).toBe(51);
  });

  it("keeps each unlock method internally consistent", () => {
    for (const item of AVATAR_MARKETPLACE_CATALOG) {
      if (item.unlockMethod === "included") {
        expect(item).toMatchObject({ purchaseSku: null, lamports: 0, rewardPoints: 0 });
      } else if (item.unlockMethod === "reward_points") {
        expect(item.purchaseSku).toBeNull();
        expect(item.lamports).toBe(0);
        expect(item.rewardPoints).toBeGreaterThan(0);
      } else {
        expect(item.purchaseSku).toBeTruthy();
        expect(item.lamports).toBe(SOLANA_AVATAR_PRODUCTS[item.purchaseSku as keyof typeof SOLANA_AVATAR_PRODUCTS].lamports);
        expect(item.rewardPoints).toBe(0);
      }
    }
  });

  it("maps every HitMeUp premium visual to one server-priced Devnet bundle", () => {
    const premium = AVATAR_MARKETPLACE_CATALOG.filter((item) => item.purchaseSku === "avatar-premium-collection");
    expect(premium.map((item) => item.value)).toEqual(expect.arrayContaining([
      "star-tee", "teal-hoodie", "street-shorts", "beanie", "bag", "wallet", "stars", "choker", "burst", "wave", "grid",
    ]));
    expect(new Set(premium.map((item) => item.lamports))).toEqual(new Set([50_000_000]));
  });

  it("publishes the procedural HitMeUp avatar pack as approved assets", () => {
    const avatarPack = AVATAR_MARKETPLACE_CATALOG.filter((item) => item.sku.startsWith("avatar."));
    expect(avatarPack).toHaveLength(44);
    expect(avatarPack.every((item) => item.assetStatus === "approved")).toBe(true);
  });

  it("offers earned-point unlocks independently from Solana payments", () => {
    const rewards = AVATAR_MARKETPLACE_CATALOG.filter((item) => item.unlockMethod === "reward_points");
    expect(rewards.map((item) => [item.sku, item.rewardPoints])).toEqual([
      ["reward-frame-mint", 40],
      ["reward-frame-solar", 60],
      ["reward-patch-nearby", 80],
      ["reward-motion-drift", 100],
    ]);
    expect(rewards.every((item) => item.purchaseSku === null && item.lamports === 0)).toBe(true);
  });

  it("quotes the premium bundle from the same server catalog", () => {
    process.env.SOLANA_NETWORK = "devnet";
    process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
    process.env.SOLANA_TREASURY = "11111111111111111111111111111111";
    expect(getSolanaAvatarProduct("avatar-premium-collection")).toEqual({ lamports: 50_000_000, label: "Avatar premium collection" });
    expect(getCosmeticQuote("avatar-premium-collection")).toEqual({
      network: "devnet",
      productId: "avatar-premium-collection",
      label: "Avatar premium collection",
      lamports: 50_000_000,
      treasury: "11111111111111111111111111111111",
    });
  });

  it("never treats inherited object properties as product SKUs", () => {
    expect(getSolanaAvatarProduct("constructor")).toBeUndefined();
    expect(getSolanaAvatarProduct("toString")).toBeUndefined();
    expect(getSolanaAvatarProduct("__proto__")).toBeUndefined();
  });
});
