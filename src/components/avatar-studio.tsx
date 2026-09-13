"use client";

import { BadgeCheck, Check, Copy, LoaderCircle, Palette, ShieldCheck, Sparkles, Star, WalletCards, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import {
  ApiError,
  getAvatarMarketplace,
  getCosmeticQuote,
  getCosmetics,
  getRewards,
  setAvatarMarketplaceItem,
  unlockCosmetic,
  unlockWithRewardPoints,
  updateProfile,
} from "@/lib/client-api";
import { AVATAR_MARKETPLACE_CATALOG } from "@/lib/avatar-marketplace-catalog";
import { devnetExplorerUrl } from "@/lib/solana-wallet";
import type { AvatarConfig, AvatarMarketplaceProjection, CosmeticProjection, CosmeticQuote, CosmeticUnlockResult, ProfileProjection, RewardSummary } from "@/lib/types";
import lauraManifestJson from "../../public/avatar/laura/manifest.json";
import { LauraCharacter } from "./laura-character";
import { SolanaWalletPay } from "./solana-wallet-pay";
import {
  StudentAvatar,
  type HairColorId,
  type HairStyleId,
  type SkinToneId,
} from "./student-avatar";

type LauraTab = "identity" | "outfits" | "expressions" | "accessories" | "backgrounds";
type PurchaseState = "idle" | "quoting" | "ready" | "verifying" | "verified" | "error" | "configuration";

type LauraCharacterAsset = {
  id: string;
  collection: "male" | "female";
  top: number;
  bottom: number;
  face: string;
  file: string;
  pixelWidth: number;
  pixelHeight: number;
};
type LauraAccessoryAsset = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  order: number;
  heightScale?: number;
  group?: string;
  file: string;
  pixelWidth: number;
  pixelHeight: number;
};
type LauraBackgroundAsset = { id: string; name: string; color: string; pattern?: string };
type LauraManifest = {
  source: { creator: string; licenseStatus: string; thirdPartyImageInputs: boolean };
  characters: LauraCharacterAsset[];
  accessories: LauraAccessoryAsset[];
  backgrounds: LauraBackgroundAsset[];
};

const LAURA_MANIFEST = lauraManifestJson as LauraManifest;
const LAURA_TABS: ReadonlyArray<{ id: LauraTab; label: string; symbol: string }> = [
  { id: "identity", label: "Identity", symbol: "●" },
  { id: "outfits", label: "Outfits", symbol: "♧" },
  { id: "expressions", label: "Face", symbol: "◡" },
  { id: "accessories", label: "Extras", symbol: "✦" },
  { id: "backgrounds", label: "Backdrop", symbol: "◐" },
];
const PREVIEW_EQUIPPED_SKUS = new Set([
  "avatar.collection.male",
  "avatar.top.male.original-jacket",
  "avatar.bottom.male.black-cargos",
  "avatar.expression.default",
  "avatar.background.signal",
]);

const SKIN_TONES: ReadonlyArray<{ id: SkinToneId; label: string; color: string }> = [
  { id: "porcelain", label: "Porcelain", color: "#F6D2BD" },
  { id: "sand", label: "Sand", color: "#E9B68F" },
  { id: "golden", label: "Golden", color: "#CC8B58" },
  { id: "umber", label: "Umber", color: "#A96643" },
  { id: "cocoa", label: "Cocoa", color: "#75442F" },
  { id: "ebony", label: "Ebony", color: "#4A2B24" },
];

const HAIR_STYLES: ReadonlyArray<{ id: HairStyleId; label: string }> = [
  { id: "crop", label: "Crop" },
  { id: "curls", label: "Curls + coils" },
  { id: "locs", label: "Locs" },
  { id: "bob", label: "Bob" },
];

const HAIR_COLORS: ReadonlyArray<{ id: HairColorId; label: string; color: string }> = [
  { id: "ink", label: "Ink", color: "#17171B" },
  { id: "chestnut", label: "Chestnut", color: "#4A2C25" },
  { id: "auburn", label: "Auburn", color: "#7C3529" },
  { id: "violet", label: "Violet", color: "#51345D" },
];

const REWARD_VISUALS: Record<string, { kind: "frame" | "patch" | "motion"; asset: string }> = {
  "reward-frame-mint": { kind: "frame", asset: "/brand/avatar-frame-mint.svg" },
  "reward-frame-solar": { kind: "frame", asset: "/brand/avatar-frame-solar.svg" },
  "reward-patch-nearby": { kind: "patch", asset: "/brand/profile-patch-nearby.svg" },
  "reward-motion-drift": { kind: "motion", asset: "/brand/avatar-motion-drift.svg" },
};
const REWARD_STAR_POINTS = 10;

function rewardStars(points: number) {
  return Math.floor(points / REWARD_STAR_POINTS);
}

function formatSol(lamports: number) {
  return `${(lamports / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
}

function previewAvatarMarketplace(): AvatarMarketplaceProjection[] {
  return AVATAR_MARKETPLACE_CATALOG.map((item) => ({
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
    equipped: PREVIEW_EQUIPPED_SKUS.has(item.sku),
    network: item.unlockMethod === "solana_devnet" ? "devnet" : null,
    assetStatus: item.assetStatus,
  }));
}

function unlockLabel(item: AvatarMarketplaceProjection) {
  if (item.assetStatus === "placeholder") {
    return item.unlockMethod === "solana_devnet" ? `${formatSol(item.lamports)} Devnet · preview only` : "Included · preview only";
  }
  if (item.owned) return item.equipped ? "Equipped" : "Owned";
  if (item.unlockMethod === "reward_points") return `${rewardStars(item.rewardPoints)} reward stars · ${item.rewardPoints} points`;
  if (item.unlockMethod === "solana_devnet") return `${formatSol(item.lamports)} Devnet`;
  return "Included";
}

function backgroundStyle(background: LauraBackgroundAsset | undefined): CSSProperties {
  return { "--laura-background": background?.color ?? "#ed4d25" } as CSSProperties;
}

function accessoryPlacement(
  accessory: LauraAccessoryAsset,
  character: LauraCharacterAsset,
): CSSProperties {
  const characterWidth = (580 * (character.pixelWidth / character.pixelHeight) / 520) * 100;
  return {
    left: `${50 + (accessory.x - 0.5) * characterWidth}%`,
    top: `${(48 / 660) * 100 + accessory.y * (580 / 660) * 100}%`,
    width: `${accessory.width * characterWidth}%`,
    zIndex: 3 + accessory.order,
    "--accessory-height-scale": accessory.heightScale ?? 1,
  } as CSSProperties;
}

function errorCopy(error: unknown) {
  if (error instanceof ApiError) {
    return {
      state: error.code === "configuration" ? "configuration" as const : "error" as const,
      message: error.message,
    };
  }
  return { state: "error" as const, message: "The Devnet request could not be completed." };
}

export function AvatarStudio({
  profile,
  previewMode,
  onProfileChange,
  onCatalogChange,
}: {
  profile: ProfileProjection | null;
  catalog: CosmeticProjection[];
  catalogStatus: "loading" | "ready" | "error";
  previewMode: boolean;
  onProfileChange: (profile: ProfileProjection | null) => void;
  onCatalogChange: (catalog: CosmeticProjection[]) => void;
}) {
  const [skin, setSkin] = useState<SkinToneId>(profile?.avatarConfig.skin ?? "golden");
  const [hair, setHair] = useState<HairStyleId>(profile?.avatarConfig.hair ?? "curls");
  const [hairColor, setHairColor] = useState<HairColorId>(profile?.avatarConfig.hairColor ?? "ink");
  const [avatarSaveState, setAvatarSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lauraTab, setLauraTab] = useState<LauraTab>("identity");
  const [avatarMarketplace, setAvatarMarketplace] = useState<AvatarMarketplaceProjection[]>(() => previewMode ? previewAvatarMarketplace() : []);
  const [avatarMarketplaceStatus, setAvatarMarketplaceStatus] = useState<"loading" | "ready" | "error">(previewMode ? "ready" : "loading");
  const [avatarMarketplaceMessage, setAvatarMarketplaceMessage] = useState("");
  const [avatarMarketplaceBusySku, setAvatarMarketplaceBusySku] = useState<string | null>(null);
  const [avatarPreviewByGroup, setAvatarPreviewByGroup] = useState<Record<string, string>>({});
  const [selectedAvatarItem, setSelectedAvatarItem] = useState<AvatarMarketplaceProjection | null>(null);
  const [rewards, setRewards] = useState<RewardSummary | null>(() => previewMode ? { balance: 120, lifetimeEarned: 120, lifetimeSpent: 0, unlockedSkus: [] } : null);
  const [rewardsStatus, setRewardsStatus] = useState<"loading" | "ready" | "error">(previewMode ? "ready" : "loading");
  const [avatarQuote, setAvatarQuote] = useState<CosmeticQuote | null>(null);
  const [avatarPurchaseState, setAvatarPurchaseState] = useState<PurchaseState>("idle");
  const [avatarPurchaseMessage, setAvatarPurchaseMessage] = useState("");
  const [avatarSignature, setAvatarSignature] = useState("");
  const [avatarUnlockResult, setAvatarUnlockResult] = useState<CosmeticUnlockResult | null>(null);
  const [avatarVerifiedSignature, setAvatarVerifiedSignature] = useState<string | null>(null);
  const persistedAvatarKey = profile ? Object.values(profile.avatarConfig).join(":") : "";
  const hydratedAvatarKey = useRef(persistedAvatarKey);

  useEffect(() => {
    if (!profile || !persistedAvatarKey || hydratedAvatarKey.current === persistedAvatarKey) return;
    hydratedAvatarKey.current = persistedAvatarKey;
    setSkin(profile.avatarConfig.skin);
    setHair(profile.avatarConfig.hair);
    setHairColor(profile.avatarConfig.hairColor);
    setAvatarSaveState("idle");
  }, [persistedAvatarKey, profile]);

  useEffect(() => {
    let active = true;
    if (previewMode) {
      return () => { active = false; };
    }

    void getAvatarMarketplace().then((items) => {
      if (!active) return;
      setAvatarMarketplace(items);
      setAvatarMarketplaceStatus("ready");
    }).catch(() => {
      if (!active) return;
      setAvatarMarketplaceStatus("error");
      setAvatarMarketplaceMessage("The server-backed avatar collection could not be loaded.");
    });
    void getRewards().then((summary) => {
      if (!active) return;
      setRewards(summary);
      setRewardsStatus("ready");
    }).catch(() => {
      if (!active) return;
      setRewardsStatus("error");
    });
    return () => { active = false; };
  }, [previewMode]);

  const wallet = profile?.solanaWallet ?? null;
  const avatarConfig: AvatarConfig = profile
    ? { ...profile.avatarConfig, skin, hair, hairColor }
    : { skin, hair, hairColor, face: "smile", outfit: "hoodie", accessory: "none" };
  const savedAvatar = profile?.avatarConfig;
  const avatarDirty = Boolean(savedAvatar) && Object.entries(avatarConfig).some(([key, value]) => savedAvatar?.[key as keyof AvatarConfig] !== value);
  const collectionItems = avatarMarketplace.filter((item) => item.category === "collection");
  const previewCollection = collectionItems.find((item) => item.sku === avatarPreviewByGroup.collection);
  const activeCollectionItem = previewCollection ?? collectionItems.find((item) => item.equipped) ?? collectionItems[0];
  const activeCollection = activeCollectionItem?.value === "female" ? "female" as const : "male" as const;
  const collectionMatches = (item: AvatarMarketplaceProjection) => item.collections.includes(activeCollection);
  const topItems = avatarMarketplace.filter((item) => item.category === "top" && collectionMatches(item));
  const bottomItems = avatarMarketplace.filter((item) => item.category === "bottom" && collectionMatches(item));
  const expressionItems = avatarMarketplace.filter((item) => item.category === "expression" && collectionMatches(item));
  const accessoryItems = avatarMarketplace.filter((item) => item.category === "accessory" && collectionMatches(item));
  const backgroundItems = avatarMarketplace.filter((item) => item.category === "background" && collectionMatches(item));
  const activeInGroup = (group: string, items: AvatarMarketplaceProjection[]) => {
    const previewSku = avatarPreviewByGroup[group];
    return items.find((item) => item.sku === previewSku) ?? items.find((item) => item.equipped) ?? items[0];
  };
  const activeTop = activeInGroup("top", topItems);
  const activeBottom = activeInGroup("bottom", bottomItems);
  const activeExpression = activeInGroup("expression", expressionItems);
  const activeExpressionValue = ["default", "happy", "playful"].includes(activeExpression?.value ?? "")
    ? activeExpression?.value as "default" | "happy" | "playful"
    : "default";
  const activeBackground = activeInGroup("background", backgroundItems);
  const activeAccessoryItems = Array.from(new Set(accessoryItems.map((item) => item.equipGroup))).map((group) => {
    const previewSku = avatarPreviewByGroup[group];
    if (previewSku === "") return undefined;
    return accessoryItems.find((item) => item.sku === previewSku) ?? accessoryItems.find((item) => item.equipGroup === group && item.equipped);
  }).filter((item): item is AvatarMarketplaceProjection => Boolean(item));
  const topIndex = Math.max(0, topItems.findIndex((item) => item.sku === activeTop?.sku));
  const bottomIndex = Math.max(0, bottomItems.findIndex((item) => item.sku === activeBottom?.sku));
  const activeCharacterAsset = LAURA_MANIFEST.characters.find((item) => item.collection === activeCollection && item.top === topIndex && item.bottom === bottomIndex && item.face === activeExpressionValue);
  const activeBackgroundAsset = LAURA_MANIFEST.backgrounds.find((item) => item.id === activeBackground?.value);
  const activeAccessoryAssets = activeAccessoryItems.map((item) => LAURA_MANIFEST.accessories.find((asset) => asset.id === item.value)).filter((item): item is LauraAccessoryAsset => Boolean(item));
  const rewardItems = avatarMarketplace.filter((item) => item.unlockMethod === "reward_points" && Boolean(REWARD_VISUALS[item.sku]));
  const activeRewardItems = rewardItems.filter((item) => {
    if (Object.hasOwn(avatarPreviewByGroup, item.equipGroup)) return avatarPreviewByGroup[item.equipGroup] === item.sku;
    return item.equipped;
  });
  const hasLocalAvatarPreview = previewMode || avatarDirty || Object.keys(avatarPreviewByGroup).length > 0;
  const hasPlaceholderAssets = avatarMarketplace.some((item) => item.assetStatus === "placeholder");
  const balancePoints = rewards?.balance ?? 0;
  const nextLockedReward = rewardItems.filter((item) => !item.owned).sort((left, right) => left.rewardPoints - right.rewardPoints)[0];
  const nextRewardProgress = nextLockedReward ? Math.min(100, (balancePoints / nextLockedReward.rewardPoints) * 100) : 100;
  const skinLabel = SKIN_TONES.find((item) => item.id === skin)?.label ?? skin;
  const hairLabel = HAIR_STYLES.find((item) => item.id === hair)?.label ?? hair;

  function updateAvatarField<T>(current: T, next: T, setter: (value: T) => void) {
    if (current === next) return;
    setAvatarSaveState("idle");
    setter(next);
  }

  async function saveAvatar() {
    if (!profile || previewMode || !avatarDirty || avatarSaveState === "saving") return;
    setAvatarSaveState("saving");
    try {
      const result = await updateProfile({ avatarConfig });
      if (!result.updated) throw new ApiError("The avatar update was not confirmed.", 502, "invalid_response");
      hydratedAvatarKey.current = Object.values(avatarConfig).join(":");
      onProfileChange({ ...profile, avatarConfig });
      setAvatarSaveState("saved");
    } catch {
      setAvatarSaveState("error");
    }
  }

  async function copyQuoteValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setAvatarPurchaseMessage("Copied to clipboard.");
    } catch {
      setAvatarPurchaseMessage("Copy was blocked. Select the value manually.");
    }
  }

  async function refreshAvatarMarketplace() {
    const items = await getAvatarMarketplace();
    setAvatarMarketplace(items);
    setAvatarMarketplaceStatus("ready");
    return items;
  }

  function moveLauraTab(event: KeyboardEvent<HTMLButtonElement>, currentTab: LauraTab) {
    const currentIndex = LAURA_TABS.findIndex((tab) => tab.id === currentTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % LAURA_TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + LAURA_TABS.length) % LAURA_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = LAURA_TABS.length - 1;
    if (nextIndex === currentIndex) return;
    event.preventDefault();
    const nextTab = LAURA_TABS[nextIndex].id;
    setLauraTab(nextTab);
    document.getElementById(`laura-avatar-tab-${nextTab}`)?.focus();
  }

  function previewAvatarItem(item: AvatarMarketplaceProjection) {
    setAvatarPreviewByGroup((current) => ({ ...current, [item.equipGroup]: item.sku }));
    setSelectedAvatarItem(item.owned ? null : item);
    setAvatarQuote(null);
    setAvatarSignature("");
    setAvatarUnlockResult(null);
    setAvatarVerifiedSignature(null);
    setAvatarPurchaseState("idle");
    setAvatarPurchaseMessage(item.owned ? "" : `${item.label} is previewed. Ownership still comes from the server.`);
  }

  async function chooseAvatarItem(item: AvatarMarketplaceProjection) {
    const currentlyPreviewed = avatarPreviewByGroup[item.equipGroup] === item.sku;
    const shouldUnequip = item.category === "accessory" && (item.equipped || currentlyPreviewed);
    if (previewMode) {
      setAvatarPreviewByGroup((current) => ({ ...current, [item.equipGroup]: shouldUnequip ? "" : item.sku }));
      if (!item.owned && !shouldUnequip) {
        setSelectedAvatarItem(item);
        setAvatarPurchaseMessage("Preview data only. Unlock and equip actions require the live app.");
      } else {
        setSelectedAvatarItem(null);
      }
      return;
    }
    if (item.assetStatus === "placeholder") {
      setAvatarPreviewByGroup((current) => ({ ...current, [item.equipGroup]: shouldUnequip ? "" : item.sku }));
      setSelectedAvatarItem(null);
      setAvatarMarketplaceMessage(`${item.label} is still review-gated by the backend. Preview is available, but equip and unlock remain disabled until the server catalog approves it.`);
      return;
    }
    if (!item.owned) {
      previewAvatarItem(item);
      return;
    }
    if (item.equipped && item.category !== "accessory") return;

    setAvatarMarketplaceBusySku(item.sku);
    setAvatarMarketplaceMessage("");
    try {
      await setAvatarMarketplaceItem(item.sku, !shouldUnequip);
      await refreshAvatarMarketplace();
      setAvatarPreviewByGroup((current) => {
        const next = { ...current };
        delete next[item.equipGroup];
        return next;
      });
      setSelectedAvatarItem(null);
      setAvatarMarketplaceMessage(`${item.label} ${shouldUnequip ? "removed" : "equipped"} on your profile.`);
    } catch (error) {
      setAvatarMarketplaceMessage(error instanceof Error ? error.message : "This avatar item could not be updated.");
    } finally {
      setAvatarMarketplaceBusySku(null);
    }
  }

  async function unlockAvatarReward(item: AvatarMarketplaceProjection) {
    if (previewMode || item.unlockMethod !== "reward_points") return;
    setAvatarMarketplaceBusySku(item.sku);
    setAvatarPurchaseMessage("");
    try {
      const result = await unlockWithRewardPoints(item.sku);
      setRewards(result.rewards);
      try {
        await setAvatarMarketplaceItem(item.sku, true);
        await refreshAvatarMarketplace();
      } catch {
        await refreshAvatarMarketplace().catch(() => undefined);
        setSelectedAvatarItem(null);
        setAvatarMarketplaceMessage(`${item.label} is unlocked and owned. Equipping did not finish; select it again to equip.`);
        return;
      }
      setAvatarPreviewByGroup((current) => {
        const next = { ...current };
        delete next[item.equipGroup];
        return next;
      });
      setSelectedAvatarItem(null);
      setAvatarMarketplaceMessage(`${item.label} unlocked with earned points and equipped.`);
    } catch (error) {
      setAvatarPurchaseMessage(error instanceof Error ? error.message : "This reward could not be unlocked.");
    } finally {
      setAvatarMarketplaceBusySku(null);
    }
  }

  async function requestAvatarQuote(item: AvatarMarketplaceProjection) {
    if (previewMode || item.unlockMethod !== "solana_devnet" || !item.purchaseSku) return;
    setAvatarPurchaseState("quoting");
    setAvatarPurchaseMessage("");
    try {
      const nextQuote = await getCosmeticQuote(item.purchaseSku);
      if (nextQuote.network !== "devnet" || nextQuote.productId !== item.purchaseSku || nextQuote.lamports !== item.lamports) {
        throw new ApiError("The Devnet quote did not match the server marketplace item.", 502, "invalid_response");
      }
      setAvatarQuote(nextQuote);
      setAvatarPurchaseState("ready");
    } catch (error) {
      const failure = errorCopy(error);
      setAvatarPurchaseState(failure.state);
      setAvatarPurchaseMessage(failure.message);
    }
  }

  async function acceptAvatarUnlock(result: CosmeticUnlockResult, usedSignature: string) {
    if (!selectedAvatarItem?.purchaseSku || !avatarQuote) throw new ApiError("The active avatar checkout changed.", 409, "invalid_response");
    if (!result.verified || result.network !== "devnet" || result.productId !== selectedAvatarItem.purchaseSku || result.lamports !== avatarQuote.lamports) {
      throw new ApiError("The verified unlock did not match the selected avatar bundle.", 502, "invalid_response");
    }
    const refreshed = await refreshAvatarMarketplace();
    const unlockedVisual = refreshed.find((item) => item.sku === selectedAvatarItem.sku);
    if (!unlockedVisual?.owned) throw new ApiError("Payment was verified, but the visual entitlement is not visible yet. Refresh before retrying equip.", 409, "entitlement_pending");
    setAvatarUnlockResult(result);
    setAvatarVerifiedSignature(usedSignature);
    setAvatarPurchaseState("verified");
    try {
      await setAvatarMarketplaceItem(selectedAvatarItem.sku, true);
      await refreshAvatarMarketplace();
    } catch {
      setAvatarPurchaseMessage(`${selectedAvatarItem.label} is server-owned. Equipping did not finish; close this panel and select it again to equip.`);
      return;
    }
    setAvatarPreviewByGroup((current) => {
      const next = { ...current };
      delete next[selectedAvatarItem.equipGroup];
      return next;
    });
    setAvatarPurchaseMessage(`${selectedAvatarItem.label} is server-owned and equipped.`);
    try {
      onCatalogChange(await getCosmetics());
    } catch {
      // The new marketplace is already refreshed; the compatibility catalogue can catch up later.
    }
  }

  async function verifyAvatarSignature(event: FormEvent) {
    event.preventDefault();
    if (!selectedAvatarItem?.purchaseSku || !avatarQuote || !profile?.solanaWallet || !avatarSignature.trim()) return;
    setAvatarPurchaseState("verifying");
    setAvatarPurchaseMessage("");
    try {
      const cleanSignature = avatarSignature.trim();
      const result = await unlockCosmetic(selectedAvatarItem.purchaseSku, cleanSignature, avatarQuote.checkoutId);
      await acceptAvatarUnlock(result, cleanSignature);
    } catch (error) {
      const failure = errorCopy(error);
      setAvatarPurchaseState(failure.state);
      setAvatarPurchaseMessage(failure.message);
    }
  }

  function isAvatarItemActive(item: AvatarMarketplaceProjection) {
    if (Object.hasOwn(avatarPreviewByGroup, item.equipGroup)) return avatarPreviewByGroup[item.equipGroup] === item.sku;
    return item.equipped;
  }

  function characterAssetForItem(item: AvatarMarketplaceProjection) {
    const itemCollection = item.category === "collection" && item.value === "female" ? "female" as const : item.category === "collection" ? "male" as const : activeCollection;
    const collectionTops = avatarMarketplace.filter((candidate) => candidate.category === "top" && candidate.collections.includes(itemCollection));
    const collectionBottoms = avatarMarketplace.filter((candidate) => candidate.category === "bottom" && candidate.collections.includes(itemCollection));
    const nextTop = item.category === "top" ? Math.max(0, collectionTops.findIndex((candidate) => candidate.sku === item.sku)) : itemCollection === activeCollection ? topIndex : 0;
    const nextBottom = item.category === "bottom" ? Math.max(0, collectionBottoms.findIndex((candidate) => candidate.sku === item.sku)) : itemCollection === activeCollection ? bottomIndex : 0;
    const nextFace = item.category === "expression" ? item.value : itemCollection === activeCollection ? activeExpression?.value ?? "default" : "default";
    return LAURA_MANIFEST.characters.find((asset) => asset.collection === itemCollection && asset.top === nextTop && asset.bottom === nextBottom && asset.face === nextFace);
  }

  function lauraOptionTile(item: AvatarMarketplaceProjection) {
    const active = isAvatarItemActive(item);
    const characterAsset = ["collection", "top", "bottom", "expression"].includes(item.category) ? characterAssetForItem(item) : undefined;
    const accessoryAsset = item.category === "accessory" ? LAURA_MANIFEST.accessories.find((asset) => asset.id === item.value) : undefined;
    const backgroundAsset = item.category === "background" ? LAURA_MANIFEST.backgrounds.find((asset) => asset.id === item.value) : undefined;
    const rewardVisual = REWARD_VISUALS[item.sku];
    const busy = avatarMarketplaceBusySku === item.sku;
    return <button
      className={`laura-option-tile category-${item.category} unlock-${item.unlockMethod} asset-${item.assetStatus} ${active ? "is-active" : ""} ${!item.owned ? "is-locked" : ""}`}
      type="button"
      aria-pressed={active}
      aria-label={`${item.label}, ${unlockLabel(item)}`}
      disabled={Boolean(avatarMarketplaceBusySku)}
      onClick={() => void chooseAvatarItem(item)}
      key={item.sku}
    >
      <span className={`laura-option-art laura-background-${backgroundAsset?.pattern ?? backgroundAsset?.id ?? "none"}`} style={backgroundStyle(backgroundAsset)}>
        {characterAsset && <Image src={characterAsset.file} alt="" width={characterAsset.pixelWidth} height={characterAsset.pixelHeight} />}
        {accessoryAsset && <Image src={accessoryAsset.file} alt="" width={accessoryAsset.pixelWidth} height={accessoryAsset.pixelHeight} />}
        {rewardVisual && <Image className={`laura-reward-thumb is-${rewardVisual.kind}`} src={rewardVisual.asset} alt="" width={160} height={160} />}
        {!characterAsset && !accessoryAsset && !backgroundAsset && !rewardVisual && <Sparkles size={24} />}
      </span>
      <strong>{item.label}</strong>
      <small>{busy ? "Updating…" : unlockLabel(item)}</small>
      {active && <span className="laura-option-check" aria-hidden="true"><Check size={12} /></span>}
    </button>;
  }

  return (
    <section className="profile-section avatar-studio" aria-labelledby="avatar-studio-title">
      <div className="avatar-studio-hero">
        <div>
          <span className="section-kicker">YOUR LOOK. YOUR RULES.</span>
          <h2 id="avatar-studio-title">MAKE IT <em>YOU.</em><span aria-hidden="true">✳</span></h2>
        </div>
        <p>Find your fit.<br />Add the details that make it yours.</p>
        <span className="studio-mark" aria-hidden="true"><Palette size={19} /></span>
      </div>
      <p className="section-copy avatar-studio-intro">Laura&apos;s complete HitMeUp look builder, now connected to your verified profile, server-owned cosmetics, rewards and Devnet unlocks.</p>

      <div className="avatar-access-guide" aria-label="Avatar customization access">
        <div><span className="access-guide-icon is-included" aria-hidden="true"><Check size={16} /></span><p><strong>Always included</strong><span>Skin tones, hair textures, hair colors and core pieces stay free. Identity is never paywalled.</span></p></div>
        <div><span className="access-guide-icon is-earned" aria-hidden="true"><Star size={16} /></span><p><strong>Earned rewards</strong><span>Complete and mutually rate real services to earn non-cash reward stars for collectibles.</span></p></div>
        <div><span className="access-guide-icon is-collectible" aria-hidden="true"><Sparkles size={16} /></span><p><strong>Devnet collection</strong><span>Premium pieces unlock through the verified test-token flow. Artwork is original SVG; ownership still comes only from the backend.</span></p></div>
      </div>

      <section className="laura-avatar-marketplace" aria-labelledby="laura-marketplace-heading">
        <div className="laura-marketplace-bar">
          <div><span className="section-kicker">HITMEUP ORIGINALS · SERVER BACKED</span><h3 id="laura-marketplace-heading">Build the full look.</h3></div>
          <div className="reward-balance" aria-label={`${balancePoints} HitMeUp points, equal to ${rewardStars(balancePoints)} reward stars`}><Star size={16} /><span>{rewardsStatus === "loading" ? "Loading rewards…" : rewardsStatus === "error" ? "Rewards unavailable" : <><strong>{rewardStars(balancePoints)}</strong> stars <small>{balancePoints} points</small></>}</span></div>
        </div>

        {avatarMarketplaceStatus === "loading" && <div className="laura-marketplace-state" role="status"><LoaderCircle className="spin" size={18} /> Loading your server-owned avatar collection…</div>}
        {avatarMarketplaceStatus === "error" && <div className="laura-marketplace-state is-error" role="alert"><ShieldCheck size={18} /><span>{avatarMarketplaceMessage || "The avatar collection is unavailable."} Your saved avatar remains unchanged.</span></div>}

        {avatarMarketplaceStatus === "ready" && <>
          {hasPlaceholderAssets && <div className="avatar-asset-notice" role="note"><ShieldCheck size={17} /><p><strong>Server review gate</strong><span>The production-safe HitMeUp SVG pack is present, but some catalog entries are still marked for backend review. Those options remain preview-only until the server approves them.</span></p></div>}
          <div className="laura-workspace">
            <div className="laura-preview-panel">
              <div className="avatar-preview-top"><span>01 / YOUR CHARACTER</span><span>{hasLocalAvatarPreview ? "LOCAL ART PREVIEW" : "SERVER LOADOUT"}</span></div>
              <div className={`laura-stage laura-background-${activeBackgroundAsset?.pattern ?? activeBackgroundAsset?.id ?? "signal"}`} style={backgroundStyle(activeBackgroundAsset)}>
                <span className="avatar-stage-note" aria-hidden="true">YOUR AVATAR.<br />YOUR STORY.</span>
                {activeCharacterAsset ? <div className="laura-character-canvas" role="img" aria-label={`${activeCollection} avatar with ${skinLabel} skin tone and ${hairLabel} hair, wearing ${activeTop?.label ?? "default top"}, ${activeBottom?.label ?? "default bottom"}, ${activeExpression?.label ?? "default expression"}, with ${activeAccessoryItems.length} accessories and ${activeBackground?.label ?? "signal background"}`}>
                  <LauraCharacter key={`${activeCollection}:${topIndex}:${bottomIndex}:${activeExpressionValue}:${skin}:${hair}:${hairColor}`} className="laura-character-art" collection={activeCollection} top={topIndex} bottom={bottomIndex} expression={activeExpressionValue} skin={skin} hair={hair} hairColor={hairColor} />
                  {activeAccessoryAssets.map((asset) => <Image key={asset.id} className="laura-accessory-art" src={asset.file} alt="" width={asset.pixelWidth} height={asset.pixelHeight} style={accessoryPlacement(asset, activeCharacterAsset)} />)}
                  {activeRewardItems.map((item) => {
                    const visual = REWARD_VISUALS[item.sku];
                    return <Image key={item.sku} className={`laura-reward-layer is-${visual.kind}`} src={visual.asset} alt="" width={560} height={560} />;
                  })}
                </div> : <div className="laura-art-missing" role="status">This look asset is unavailable.</div>}
                <span className="avatar-stage-sticker" aria-hidden="true">100% YOU</span>
              </div>
              <div className="avatar-preview-bottom">
                <div><span>YOUR CURRENT LOOK</span><strong>{activeTop?.label ?? "Original look"}</strong><small>{skinLabel} · {hairLabel} · {activeBottom?.label ?? "Default bottom"} · {activeExpression?.label ?? "Default"}</small></div>
                <span className={`server-loadout-mark ${hasLocalAvatarPreview ? "is-preview" : ""}`}><ShieldCheck size={15} />{hasLocalAvatarPreview ? "Preview only" : "Backend loadout"}</span>
              </div>
              <div className="avatar-profile-sync"><span>{activeAccessoryItems.length} ACCESSOR{activeAccessoryItems.length === 1 ? "Y" : "IES"} {hasLocalAvatarPreview ? "PREVIEWED" : "EQUIPPED"}</span><span>{hasLocalAvatarPreview ? "PREVIEW IS NOT OWNERSHIP" : "OWNERSHIP VERIFIED SERVER-SIDE"}</span></div>
            </div>

            <div className="laura-editor">
              <div className="laura-character-switch" role="group" aria-label="Avatar collection">
                {collectionItems.map((item) => <button type="button" key={item.sku} aria-pressed={isAvatarItemActive(item)} className={isAvatarItemActive(item) ? "is-active" : ""} onClick={() => void chooseAvatarItem(item)} disabled={Boolean(avatarMarketplaceBusySku)}><span className="collection-symbol" aria-hidden="true">{item.value === "female" ? "♀" : "♂"}</span><span><strong>{item.value === "female" ? "Female" : "Male"}</strong><small>{item.value === "female" ? "A new energy" : "The original"}</small></span><Check className="collection-check" size={16} aria-hidden="true" /></button>)}
              </div>
              <div className="avatar-editor-title"><div><span>{activeCollection.toUpperCase()} COLLECTION</span><h3>{lauraTab === "identity" ? "Start with you." : lauraTab === "outfits" ? "Find your fit." : lauraTab === "expressions" ? "Set the expression." : lauraTab === "accessories" ? "Make it your own." : "Set the scene."}</h3></div><span>{activeAccessoryItems.length} EQUIPPED</span></div>
              <div className="laura-category-tabs" role="tablist" aria-label="HitMeUp avatar customization">
                {LAURA_TABS.map(({ id, label, symbol }) => <button key={id} id={`laura-avatar-tab-${id}`} type="button" role="tab" aria-selected={lauraTab === id} aria-controls={`laura-avatar-panel-${id}`} tabIndex={lauraTab === id ? 0 : -1} className={lauraTab === id ? "is-active" : ""} onClick={() => setLauraTab(id)} onKeyDown={(event) => moveLauraTab(event, id)}><span aria-hidden="true">{symbol}</span>{label}</button>)}
              </div>

              {lauraTab === "identity" && <div className="laura-tab-panel identity-panel" id="laura-avatar-panel-identity" role="tabpanel" aria-labelledby="laura-avatar-tab-identity">
                <div className="identity-free-note" role="note"><ShieldCheck size={18} /><p><strong>Identity is always included.</strong><span>Every skin tone, hair texture and hair color below is free. Only decorative extras can be earned or unlocked.</span></p></div>
                <fieldset className="identity-control"><legend>Skin tone <span>6 included</span></legend><div className="identity-swatch-grid">{SKIN_TONES.map((item) => <button type="button" key={item.id} className={skin === item.id ? "is-active" : ""} aria-pressed={skin === item.id} onClick={() => updateAvatarField(skin, item.id, setSkin)}><i style={{ background: item.color }} aria-hidden="true" /><span>{item.label}</span>{skin === item.id && <Check size={13} />}</button>)}</div></fieldset>
                <fieldset className="identity-control"><legend>Hair texture <span>4 included</span></legend><div className="identity-hair-grid">{HAIR_STYLES.map((item) => <button type="button" key={item.id} className={hair === item.id ? "is-active" : ""} aria-pressed={hair === item.id} onClick={() => updateAvatarField(hair, item.id, setHair)}><StudentAvatar className="student-avatar" skin={skin} hair={item.id} hairColor={hairColor} face={avatarConfig.face} outfit={avatarConfig.outfit} accessory={avatarConfig.accessory} title="" /><span>{item.label}</span>{hair === item.id && <Check size={13} />}</button>)}</div></fieldset>
                <fieldset className="identity-control"><legend>Hair color <span>4 included</span></legend><div className="identity-color-grid">{HAIR_COLORS.map((item) => <button type="button" key={item.id} className={hairColor === item.id ? "is-active" : ""} aria-pressed={hairColor === item.id} onClick={() => updateAvatarField(hairColor, item.id, setHairColor)}><i style={{ background: item.color }} aria-hidden="true" /><span>{item.label}</span>{hairColor === item.id && <Check size={13} />}</button>)}</div></fieldset>
                <div className="identity-save-row"><p><strong>Profile synced, not browser-owned.</strong><span>Your identity choices use the existing verified profile contract.</span></p><button type="button" className="identity-save-button" onClick={() => void saveAvatar()} disabled={previewMode || !profile || !avatarDirty || avatarSaveState === "saving"}>{previewMode ? "Live app only" : avatarSaveState === "saving" ? "Saving…" : avatarSaveState === "saved" ? "Saved" : avatarDirty ? "Save identity" : "Identity saved"}</button></div>
                {avatarSaveState === "error" && <p className="identity-save-status is-error" role="alert">Identity changes could not be saved. Your previous profile remains unchanged.</p>}
                {avatarSaveState === "saved" && <p className="identity-save-status" role="status">Identity saved to your profile.</p>}
              </div>}
              {lauraTab === "outfits" && <div className="laura-tab-panel" id="laura-avatar-panel-outfits" role="tabpanel" aria-labelledby="laura-avatar-tab-outfits">
                <div className="laura-option-heading"><strong>Tops</strong><span>3 choices</span></div><div className="laura-option-grid variant-grid">{topItems.map(lauraOptionTile)}</div>
                <div className="laura-option-heading"><strong>Bottoms</strong><span>3 choices</span></div><div className="laura-option-grid variant-grid">{bottomItems.map(lauraOptionTile)}</div>
              </div>}
              {lauraTab === "expressions" && <div className="laura-tab-panel" id="laura-avatar-panel-expressions" role="tabpanel" aria-labelledby="laura-avatar-tab-expressions">
                <div className="laura-option-heading"><strong>Expressions</strong><span>3 choices</span></div><div className="laura-option-grid variant-grid">{expressionItems.map(lauraOptionTile)}</div>
              </div>}
              {lauraTab === "accessories" && <div className="laura-tab-panel" id="laura-avatar-panel-accessories" role="tabpanel" aria-labelledby="laura-avatar-tab-accessories">
                <div className="laura-option-heading"><strong>Pick your extras</strong><span>{accessoryItems.length} pieces</span></div><div className="laura-option-grid accessory-grid">{accessoryItems.map(lauraOptionTile)}</div>
                <p className="laura-stack-note">Stack different groups together. Eyewear, hats, earrings and necklaces replace only the item in their own group.</p>
              </div>}
              {lauraTab === "backgrounds" && <div className="laura-tab-panel" id="laura-avatar-panel-backgrounds" role="tabpanel" aria-labelledby="laura-avatar-tab-backgrounds">
                <div className="laura-option-heading"><strong>Solid colors</strong><span>6 styles</span></div><div className="laura-option-grid background-grid">{backgroundItems.filter((item) => !LAURA_MANIFEST.backgrounds.find((asset) => asset.id === item.value)?.pattern).map(lauraOptionTile)}</div>
                <div className="laura-option-heading"><strong>Graphic backgrounds</strong><span>6 styles</span></div><div className="laura-option-grid background-grid">{backgroundItems.filter((item) => Boolean(LAURA_MANIFEST.backgrounds.find((asset) => asset.id === item.value)?.pattern)).map(lauraOptionTile)}</div>
              </div>}
              <div className="avatar-editor-foot"><span>SMALL DETAILS. BIG PERSONALITY.</span><span>{avatarMarketplaceBusySku ? "Updating server loadout…" : hasLocalAvatarPreview ? "Local preview only · no ownership changed." : "Every equip change is validated by the backend."}</span></div>
            </div>
          </div>

          {rewardItems.length > 0 && <section className="laura-reward-shelf" aria-labelledby="laura-reward-heading">
            <div className="laura-option-heading"><div><span className="section-kicker">EARNED, NEVER BOUGHT</span><strong id="laura-reward-heading">Service reward collectibles</strong></div><span>{rewardItems.length} pieces · {rewardStars(balancePoints)} stars available</span></div>
            <p>Reward stars are a friendly display of backend points: 1 star equals {REWARD_STAR_POINTS} points. Rating quality never changes the reward.</p>
            <div className="reward-rules" aria-label="How to earn reward stars">
              <div><span>01</span><p><strong>Meet through HitMeUp</strong><small>The accepted request must reach the meeting stage.</small></p></div>
              <div><span>02</span><p><strong>Both confirm completion</strong><small>The requester and provider must each finish the service.</small></p></div>
              <div><span>03</span><p><strong>Both submit a rating</strong><small>When the request closes, each student receives 5 stars / 50 points.</small></p></div>
            </div>
            <div className="reward-ledger-summary">
              <div><span>Available</span><strong>{rewardStars(balancePoints)} stars</strong><small>{balancePoints} points</small></div>
              <div><span>Earned all-time</span><strong>{rewardStars(rewards?.lifetimeEarned ?? 0)} stars</strong><small>{rewards?.lifetimeEarned ?? 0} points</small></div>
              <div><span>Spent all-time</span><strong>{rewardStars(rewards?.lifetimeSpent ?? 0)} stars</strong><small>{rewards?.lifetimeSpent ?? 0} points</small></div>
              <p><ShieldCheck size={16} /><span><strong>Anti-farming limit</strong> Up to 3 rewarded services per student per UTC day.</span></p>
            </div>
            {nextLockedReward && <div className="next-reward-progress"><div><span>Next collectible</span><strong>{nextLockedReward.label}</strong><small>{rewardStars(balancePoints)} / {rewardStars(nextLockedReward.rewardPoints)} stars</small></div><div role="progressbar" aria-label={`Progress toward ${nextLockedReward.label}`} aria-valuemin={0} aria-valuemax={nextLockedReward.rewardPoints} aria-valuenow={Math.min(balancePoints, nextLockedReward.rewardPoints)}><i style={{ width: `${nextRewardProgress}%` }} /></div></div>}
            <div className="laura-option-grid reward-grid">{rewardItems.map(lauraOptionTile)}</div>
          </section>}

          {avatarMarketplaceMessage && <p className="avatar-marketplace-message" role="status">{avatarMarketplaceMessage}</p>}
          {selectedAvatarItem && !selectedAvatarItem.owned && <section className="avatar-unlock-panel" aria-labelledby="avatar-unlock-heading">
            <div className="checkout-heading"><div><span className="section-kicker">{selectedAvatarItem.unlockMethod === "reward_points" ? "EARNED REWARD" : "SOLANA DEVNET BUNDLE"}</span><h3 id="avatar-unlock-heading">Unlock {selectedAvatarItem.label}</h3></div><button className="icon-button" type="button" aria-label="Close avatar unlock" onClick={() => { setSelectedAvatarItem(null); setAvatarQuote(null); }}><X size={17} /></button></div>
            <p className="zone-intro">The visual is previewed above, but it is not owned or equipped until the server confirms the correct unlock method.</p>
            {selectedAvatarItem.unlockMethod === "reward_points" && <div className="reward-unlock-card"><Star size={22} /><div><strong>{rewardStars(selectedAvatarItem.rewardPoints)} reward stars · {selectedAvatarItem.rewardPoints} points</strong><span>Your balance: {rewardStars(balancePoints)} stars / {balancePoints} points. These non-cash rewards come only from fully closed student services.</span></div><button type="button" disabled={previewMode || rewardsStatus !== "ready" || balancePoints < selectedAvatarItem.rewardPoints || avatarMarketplaceBusySku === selectedAvatarItem.sku} onClick={() => void unlockAvatarReward(selectedAvatarItem)}>{previewMode ? "Live app only" : balancePoints < selectedAvatarItem.rewardPoints ? "More stars needed" : avatarMarketplaceBusySku ? "Unlocking…" : "Unlock with stars"}</button></div>}
            {selectedAvatarItem.unlockMethod === "solana_devnet" && <>
              <div className="checkout-notice is-warning"><WalletCards size={18} /><div><strong>One bundle, not one charge per item.</strong><p>The backend quotes {selectedAvatarItem.purchaseSku} at {formatSol(selectedAvatarItem.lamports)} on Devnet. Test tokens only; no Mainnet money.</p></div></div>
              {!avatarQuote && avatarPurchaseState !== "quoting" && <button className="unlock-button avatar-quote-button" type="button" disabled={previewMode} onClick={() => void requestAvatarQuote(selectedAvatarItem)}>{previewMode ? "Quote in live app" : "Get exact Devnet quote"}</button>}
              {avatarPurchaseState === "quoting" && <div className="checkout-notice" role="status"><LoaderCircle className="spin" size={18} /><div><strong>Requesting the exact quote…</strong><p>The purchase SKU, treasury and amount come from the authenticated backend.</p></div></div>}
              {(avatarPurchaseState === "error" || avatarPurchaseState === "configuration") && <div className="checkout-notice is-error" role="alert"><ShieldCheck size={18} /><div><strong>Devnet unlock unavailable</strong><p>{avatarPurchaseMessage}</p><button type="button" onClick={() => void requestAvatarQuote(selectedAvatarItem)}>Try again</button></div></div>}
              {avatarQuote && ["ready", "verifying", "verified"].includes(avatarPurchaseState) && <>
                <div className="quote-grid"><div><span>Network</span><strong>Solana Devnet</strong></div><div><span>Exact bundle amount</span><strong>{formatSol(avatarQuote.lamports)}</strong><small>{avatarQuote.lamports.toLocaleString()} lamports</small></div><div className="quote-wide"><span>Treasury</span><code>{avatarQuote.treasury}</code><button type="button" aria-label="Copy avatar treasury address" onClick={() => void copyQuoteValue(avatarQuote.treasury)}><Copy size={13} /> Copy</button></div></div>
                {avatarPurchaseState !== "verified" && <SolanaWalletPay key={`${avatarQuote.productId}:${avatarQuote.treasury}:${avatarQuote.lamports}`} quote={avatarQuote} linkedWallet={wallet} onWalletLinked={(publicKey) => { if (profile) onProfileChange({ ...profile, solanaWallet: publicKey }); }} onVerified={acceptAvatarUnlock} onBusyChange={(busy) => setAvatarPurchaseState(busy ? "verifying" : "ready")} />}
                {wallet && avatarPurchaseState !== "verified" && <form className="signature-form" onSubmit={verifyAvatarSignature}><div className="manual-fallback"><span>Manual fallback</span><small>Already transferred from the linked wallet? Paste its signature.</small></div><label htmlFor="avatar-devnet-signature"><span>Confirmed transaction signature</span><textarea id="avatar-devnet-signature" rows={3} value={avatarSignature} onChange={(event) => setAvatarSignature(event.target.value)} autoComplete="off" spellCheck={false} disabled={avatarPurchaseState === "verifying"} /></label><button className="primary-action" type="submit" disabled={!avatarSignature.trim() || avatarPurchaseState === "verifying"}>{avatarPurchaseState === "verifying" ? "Verifying…" : "Verify signature"}</button></form>}
              </>}
              {avatarPurchaseState === "verified" && avatarUnlockResult && <div className="checkout-success" role="status"><BadgeCheck size={19} /><div><strong>{avatarPurchaseMessage}</strong><span>Confirmed slot {avatarUnlockResult.slot.toLocaleString()}.</span>{avatarVerifiedSignature && <a href={devnetExplorerUrl(avatarVerifiedSignature)} target="_blank" rel="noreferrer">View in Solana Explorer ↗</a>}</div></div>}
            </>}
            {avatarPurchaseMessage && avatarPurchaseState === "idle" && <p className="avatar-marketplace-message" role="status">{avatarPurchaseMessage}</p>}
          </section>}
        </>}
      </section>


    </section>
  );
}
