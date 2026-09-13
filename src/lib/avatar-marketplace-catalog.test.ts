import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AVATAR_MARKETPLACE_CATALOG, SOLANA_AVATAR_PRODUCTS, getSolanaAvatarProduct } from "./avatar-marketplace-catalog";
import { getCosmeticQuote } from "./integrations/solana";

const lauraOnlyMigration = readFileSync(
  new URL("../../supabase/migrations/20260913103000_laura_avatar_catalog_only.sql", import.meta.url),
  "utf8",
);

describe("avatar marketplace catalog", () => {
  it("uses unique stable SKUs and deterministic sort positions", () => {
    expect(AVATAR_MARKETPLACE_CATALOG).toHaveLength(44);
    expect(new Set(AVATAR_MARKETPLACE_CATALOG.map((item) => item.sku)).size).toBe(44);
    expect(new Set(AVATAR_MARKETPLACE_CATALOG.map((item) => item.sortOrder)).size).toBe(44);
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

  it("maps Laura's paid visuals to one server-priced Devnet bundle", () => {
    const premium = AVATAR_MARKETPLACE_CATALOG.filter((item) => item.purchaseSku === "avatar-premium-collection");
    expect(premium.map((item) => item.value)).toEqual(expect.arrayContaining([
      "star-tee", "teal-hoodie", "street-shorts", "baggy-denim", "choker", "burst", "wave", "grid",
    ]));
    expect(premium.map((item) => item.value)).not.toEqual(expect.arrayContaining(["beanie", "bag", "wallet", "stars"]));
    expect(new Set(premium.map((item) => item.lamports))).toEqual(new Set([50_000_000]));
  });

  it("publishes only Laura catalog visuals and retires classic studio collectibles", () => {
    expect(AVATAR_MARKETPLACE_CATALOG.every((item) => item.sku.startsWith("avatar."))).toBe(true);
    expect(AVATAR_MARKETPLACE_CATALOG.every((item) => item.assetStatus === "approved")).toBe(true);
    expect(AVATAR_MARKETPLACE_CATALOG.some((item) => ["frame", "patch", "motion"].includes(item.category))).toBe(false);
    expect(AVATAR_MARKETPLACE_CATALOG.map((item) => item.sku)).not.toEqual(expect.arrayContaining([
      "profile-frame", "campus-theme", "trust-badge",
      "reward-frame-mint", "reward-frame-solar", "reward-patch-nearby", "reward-motion-drift",
    ]));
  });

  it("uses Laura accessories for earned-point unlocks independently from Solana payments", () => {
    const rewards = AVATAR_MARKETPLACE_CATALOG.filter((item) => item.unlockMethod === "reward_points");
    expect(rewards.map((item) => [item.sku, item.rewardPoints])).toEqual([
      ["avatar.accessory.beanie", 40],
      ["avatar.accessory.bag", 60],
      ["avatar.accessory.wallet", 80],
      ["avatar.accessory.stars", 80],
    ]);
    expect(rewards.every((item) => item.category === "accessory")).toBe(true);
    expect(rewards.every((item) => item.purchaseSku === null && item.lamports === 0)).toBe(true);
  });

  it("keeps identity and expression choices included", () => {
    const identityItems = AVATAR_MARKETPLACE_CATALOG.filter((item) =>
      item.category === "collection" || item.category === "expression",
    );
    expect(identityItems).toHaveLength(5);
    expect(identityItems.every((item) => item.unlockMethod === "included")).toBe(true);
  });

  it("ships a forward-only database transition to the Laura catalog", () => {
    expect(lauraOnlyMigration).toContain("set active = false");
    expect(lauraOnlyMigration).toContain("where sku in ('profile-frame', 'campus-theme', 'trust-badge')");
    for (const rewardItem of AVATAR_MARKETPLACE_CATALOG.filter((item) => item.unlockMethod === "reward_points")) {
      expect(lauraOnlyMigration).toContain(`when '${rewardItem.sku}' then ${rewardItem.rewardPoints}`);
    }
    expect(lauraOnlyMigration).not.toContain("delete from");
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
    expect(getSolanaAvatarProduct("profile-frame")).toBeUndefined();
    expect(getSolanaAvatarProduct("campus-theme")).toBeUndefined();
    expect(getSolanaAvatarProduct("trust-badge")).toBeUndefined();
  });

  it("never treats inherited object properties as product SKUs", () => {
    expect(getSolanaAvatarProduct("constructor")).toBeUndefined();
    expect(getSolanaAvatarProduct("toString")).toBeUndefined();
    expect(getSolanaAvatarProduct("__proto__")).toBeUndefined();
  });
});
