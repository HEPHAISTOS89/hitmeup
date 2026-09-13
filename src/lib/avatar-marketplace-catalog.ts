export type AvatarMarketplaceCategory =
  | "collection" | "top" | "bottom" | "expression" | "accessory" | "background" | "frame" | "patch" | "motion";
export type AvatarUnlockMethod = "included" | "reward_points" | "solana_devnet";
export type AvatarAssetStatus = "approved" | "placeholder";
export type AvatarCollection = "male" | "female";

export type AvatarMarketplaceCatalogItem = {
  sku: string;
  label: string;
  category: AvatarMarketplaceCategory;
  value: string;
  /** Items in one equip group replace one another. Separate accessory groups stack. */
  equipGroup: string;
  collections: readonly AvatarCollection[];
  unlockMethod: AvatarUnlockMethod;
  /** Server product quoted and verified for paid items. Null for included/reward items. */
  purchaseSku: string | null;
  lamports: number;
  rewardPoints: number;
  assetStatus: AvatarAssetStatus;
  sortOrder: number;
};

export const SOLANA_AVATAR_PRODUCTS = {
  "avatar-premium-collection": { lamports: 50_000_000, label: "Avatar premium collection" },
} as const;

function included(input: Omit<AvatarMarketplaceCatalogItem, "unlockMethod" | "purchaseSku" | "lamports" | "rewardPoints">): AvatarMarketplaceCatalogItem {
  return { ...input, unlockMethod: "included", purchaseSku: null, lamports: 0, rewardPoints: 0 };
}
function reward(input: Omit<AvatarMarketplaceCatalogItem, "unlockMethod" | "purchaseSku" | "lamports" | "rewardPoints">, rewardPoints: number): AvatarMarketplaceCatalogItem {
  return { ...input, unlockMethod: "reward_points", purchaseSku: null, lamports: 0, rewardPoints };
}
function premium(input: Omit<AvatarMarketplaceCatalogItem, "unlockMethod" | "purchaseSku" | "lamports" | "rewardPoints">): AvatarMarketplaceCatalogItem {
  return { ...input, unlockMethod: "solana_devnet", purchaseSku: "avatar-premium-collection", lamports: SOLANA_AVATAR_PRODUCTS["avatar-premium-collection"].lamports, rewardPoints: 0 };
}

const both = ["male", "female"] as const;
const approved = "approved" as const;

/**
 * Canonical server-backed version of Laura's HitMeUp visual catalog.
 * Every active item is represented by Laura's extracted raster artwork in
 * public/avatar/laura. Historical frames, patches and motions are deliberately
 * absent: they belong to the retired avatar studio, not this marketplace.
 */
export const AVATAR_MARKETPLACE_CATALOG: readonly AvatarMarketplaceCatalogItem[] = [
  included({ sku: "avatar.collection.male", label: "Male collection", category: "collection", value: "male", equipGroup: "collection", collections: ["male"], assetStatus: approved, sortOrder: 10 }),
  included({ sku: "avatar.collection.female", label: "Female collection", category: "collection", value: "female", equipGroup: "collection", collections: ["female"], assetStatus: approved, sortOrder: 11 }),

  included({ sku: "avatar.top.male.original-jacket", label: "Original jacket", category: "top", value: "original-jacket", equipGroup: "top", collections: ["male"], assetStatus: approved, sortOrder: 20 }),
  included({ sku: "avatar.top.male.utility-overshirt", label: "Utility overshirt", category: "top", value: "utility-overshirt", equipGroup: "top", collections: ["male"], assetStatus: approved, sortOrder: 21 }),
  premium({ sku: "avatar.top.male.star-tee", label: "Star tee", category: "top", value: "star-tee", equipGroup: "top", collections: ["male"], assetStatus: approved, sortOrder: 22 }),
  included({ sku: "avatar.top.female.red-jacket", label: "Red jacket", category: "top", value: "red-jacket", equipGroup: "top", collections: ["female"], assetStatus: approved, sortOrder: 23 }),
  included({ sku: "avatar.top.female.star-tee", label: "Star tee", category: "top", value: "star-tee", equipGroup: "top", collections: ["female"], assetStatus: approved, sortOrder: 24 }),
  premium({ sku: "avatar.top.female.teal-hoodie", label: "Teal hoodie", category: "top", value: "teal-hoodie", equipGroup: "top", collections: ["female"], assetStatus: approved, sortOrder: 25 }),

  included({ sku: "avatar.bottom.male.black-cargos", label: "Black cargos", category: "bottom", value: "black-cargos", equipGroup: "bottom", collections: ["male"], assetStatus: approved, sortOrder: 30 }),
  included({ sku: "avatar.bottom.male.baggy-denim", label: "Baggy denim", category: "bottom", value: "baggy-denim", equipGroup: "bottom", collections: ["male"], assetStatus: approved, sortOrder: 31 }),
  premium({ sku: "avatar.bottom.male.street-shorts", label: "Street shorts", category: "bottom", value: "street-shorts", equipGroup: "bottom", collections: ["male"], assetStatus: approved, sortOrder: 32 }),
  included({ sku: "avatar.bottom.female.black-cargos", label: "Black cargos", category: "bottom", value: "black-cargos", equipGroup: "bottom", collections: ["female"], assetStatus: approved, sortOrder: 33 }),
  included({ sku: "avatar.bottom.female.tartan-skirt", label: "Tartan skirt", category: "bottom", value: "tartan-skirt", equipGroup: "bottom", collections: ["female"], assetStatus: approved, sortOrder: 34 }),
  premium({ sku: "avatar.bottom.female.baggy-denim", label: "Baggy denim", category: "bottom", value: "baggy-denim", equipGroup: "bottom", collections: ["female"], assetStatus: approved, sortOrder: 35 }),

  ...["default", "happy", "playful"].map((value, index) => included({ sku: `avatar.expression.${value}`, label: value[0].toUpperCase() + value.slice(1), category: "expression", value, equipGroup: "expression", collections: both, assetStatus: approved, sortOrder: 40 + index })),

  included({ sku: "avatar.accessory.frames", label: "Clear frames", category: "accessory", value: "frames", equipGroup: "accessory:eyewear", collections: both, assetStatus: approved, sortOrder: 50 }),
  included({ sku: "avatar.accessory.shades", label: "Shades", category: "accessory", value: "shades", equipGroup: "accessory:eyewear", collections: both, assetStatus: approved, sortOrder: 51 }),
  included({ sku: "avatar.accessory.headphones", label: "Headphones", category: "accessory", value: "headphones", equipGroup: "accessory:headphones", collections: both, assetStatus: approved, sortOrder: 52 }),
  included({ sku: "avatar.accessory.cap", label: "Star cap", category: "accessory", value: "cap", equipGroup: "accessory:headwear", collections: ["male"], assetStatus: approved, sortOrder: 53 }),
  included({ sku: "avatar.accessory.chain", label: "Star chain", category: "accessory", value: "chain", equipGroup: "accessory:neckwear", collections: both, assetStatus: approved, sortOrder: 54 }),
  included({ sku: "avatar.accessory.hoops", label: "Gold hoops", category: "accessory", value: "hoops", equipGroup: "accessory:earrings", collections: both, assetStatus: approved, sortOrder: 55 }),
  included({ sku: "avatar.accessory.bow", label: "Red bow", category: "accessory", value: "bow", equipGroup: "accessory:hair", collections: ["female"], assetStatus: approved, sortOrder: 56 }),
  included({ sku: "avatar.accessory.hearts", label: "Heart frames", category: "accessory", value: "hearts", equipGroup: "accessory:eyewear", collections: ["female"], assetStatus: approved, sortOrder: 57 }),
  included({ sku: "avatar.accessory.cuff", label: "Studded cuff", category: "accessory", value: "cuff", equipGroup: "accessory:wrist", collections: ["male"], assetStatus: approved, sortOrder: 58 }),
  included({ sku: "avatar.accessory.clips", label: "Cherry clips", category: "accessory", value: "clips", equipGroup: "accessory:hair", collections: ["female"], assetStatus: approved, sortOrder: 59 }),
  reward({ sku: "avatar.accessory.beanie", label: "Night beanie", category: "accessory", value: "beanie", equipGroup: "accessory:headwear", collections: both, assetStatus: approved, sortOrder: 60 }, 40),
  reward({ sku: "avatar.accessory.bag", label: "Crossbody bag", category: "accessory", value: "bag", equipGroup: "accessory:bag", collections: both, assetStatus: approved, sortOrder: 61 }, 60),
  reward({ sku: "avatar.accessory.wallet", label: "Wallet chain", category: "accessory", value: "wallet", equipGroup: "accessory:wallet", collections: ["male"], assetStatus: approved, sortOrder: 62 }, 80),
  reward({ sku: "avatar.accessory.stars", label: "Star earrings", category: "accessory", value: "stars", equipGroup: "accessory:earrings", collections: ["female"], assetStatus: approved, sortOrder: 63 }, 80),
  premium({ sku: "avatar.accessory.choker", label: "Star choker", category: "accessory", value: "choker", equipGroup: "accessory:neckwear", collections: ["female"], assetStatus: approved, sortOrder: 64 }),

  ...[["signal", "Signal orange"], ["petrol", "Petrol blue"], ["gold", "Golden hour"], ["purple", "Purple haze"], ["dark", "After dark"], ["rose", "Rose paper"]].map(([value, label], index) => included({ sku: `avatar.background.${value}`, label, category: "background", value, equipGroup: "background", collections: both, assetStatus: approved, sortOrder: 70 + index })),
  included({ sku: "avatar.background.check", label: "Checkmate", category: "background", value: "check", equipGroup: "background", collections: both, assetStatus: approved, sortOrder: 76 }),
  included({ sku: "avatar.background.dots", label: "Dot matrix", category: "background", value: "dots", equipGroup: "background", collections: both, assetStatus: approved, sortOrder: 77 }),
  included({ sku: "avatar.background.tape", label: "Cut & paste", category: "background", value: "tape", equipGroup: "background", collections: both, assetStatus: approved, sortOrder: 78 }),
  premium({ sku: "avatar.background.burst", label: "Noise burst", category: "background", value: "burst", equipGroup: "background", collections: both, assetStatus: approved, sortOrder: 79 }),
  premium({ sku: "avatar.background.wave", label: "Sound wave", category: "background", value: "wave", equipGroup: "background", collections: both, assetStatus: approved, sortOrder: 80 }),
  premium({ sku: "avatar.background.grid", label: "Midnight grid", category: "background", value: "grid", equipGroup: "background", collections: both, assetStatus: approved, sortOrder: 81 }),
];

export const AVATAR_MARKETPLACE_BY_SKU = new Map(AVATAR_MARKETPLACE_CATALOG.map((catalogItem) => [catalogItem.sku, catalogItem]));

export function getSolanaAvatarProduct(sku: string) {
  if (!Object.hasOwn(SOLANA_AVATAR_PRODUCTS, sku)) return undefined;
  return SOLANA_AVATAR_PRODUCTS[sku as keyof typeof SOLANA_AVATAR_PRODUCTS];
}
