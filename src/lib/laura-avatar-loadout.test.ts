import { describe, expect, it } from "vitest";
import { AVATAR_MARKETPLACE_CATALOG } from "./avatar-marketplace-catalog";
import { resolveLauraAvatarLoadout } from "./laura-avatar-loadout";
import type { AvatarMarketplaceProjection } from "./types";

function projection(equipped: string[]): AvatarMarketplaceProjection[] {
  return AVATAR_MARKETPLACE_CATALOG.map((item) => ({
    ...item,
    collections: [...item.collections],
    owned: true,
    equipped: equipped.includes(item.sku),
    network: item.unlockMethod === "solana_devnet" ? "devnet" : null,
  }));
}

describe("resolveLauraAvatarLoadout", () => {
  it("uses deterministic Laura defaults for preview and unavailable data", () => {
    expect(resolveLauraAvatarLoadout(undefined)).toEqual({ collection: "male", top: 0, bottom: 0, expression: "default", accessories: [], background: "signal" });
  });

  it("uses canonical per-collection indices for persisted equipment", () => {
    expect(resolveLauraAvatarLoadout(projection([
      "avatar.collection.female",
      "avatar.top.female.teal-hoodie",
      "avatar.bottom.female.baggy-denim",
      "avatar.expression.playful",
      "avatar.accessory.stars",
      "avatar.background.grid",
    ]))).toEqual({ collection: "female", top: 2, bottom: 2, expression: "playful", accessories: ["stars"], background: "grid" });
  });
});
