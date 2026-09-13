import { AVATAR_MARKETPLACE_CATALOG } from "./avatar-marketplace-catalog";
import type { AvatarMarketplaceProjection } from "./types";

export type LauraAvatarLoadout = {
  collection: "male" | "female";
  top: number;
  bottom: number;
  expression: "default" | "happy" | "playful";
  accessories: string[];
  background: string;
};

const DEFAULT_LOADOUT: LauraAvatarLoadout = {
  collection: "male",
  top: 0,
  bottom: 0,
  expression: "default",
  accessories: [],
  background: "signal",
};

/**
 * Resolves the persisted marketplace projection into Laura's character indices.
 * Catalog order is canonical, so a partial or stale response safely falls back
 * to the first approved piece in the equipped collection.
 */
export function resolveLauraAvatarLoadout(
  items: readonly AvatarMarketplaceProjection[] | null | undefined,
): LauraAvatarLoadout {
  if (!items?.length) return DEFAULT_LOADOUT;

  const equippedCollection = items.find((item) => item.category === "collection" && item.equipped);
  const collection = equippedCollection?.value === "female" ? "female" : "male";

  const indexFor = (category: "top" | "bottom") => {
    const choices = AVATAR_MARKETPLACE_CATALOG.filter(
      (item) => item.category === category && item.collections.includes(collection),
    );
    const equipped = items.find(
      (item) => item.category === category && item.equipped && item.collections.includes(collection),
    );
    const index = choices.findIndex((item) => item.sku === equipped?.sku);
    return index < 0 ? 0 : index;
  };

  const equippedExpression = items.find(
    (item) => item.category === "expression" && item.equipped && item.collections.includes(collection),
  )?.value;
  const expression = equippedExpression === "happy" || equippedExpression === "playful"
    ? equippedExpression
    : "default";

  const accessories = items
    .filter((item) => item.category === "accessory" && item.equipped && item.collections.includes(collection))
    .map((item) => item.value);
  const background = items.find(
    (item) => item.category === "background" && item.equipped && item.collections.includes(collection),
  )?.value ?? "signal";

  return { collection, top: indexFor("top"), bottom: indexFor("bottom"), expression, accessories, background };
}
