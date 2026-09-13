"use client";

import { BadgeCheck, Check, Coins, Copy, LoaderCircle, LockKeyhole, Palette, ShieldCheck, Sparkles, WalletCards, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import {
  ApiError,
  equipCosmetic,
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
import { SolanaWalletPay } from "./solana-wallet-pay";
import {
  StudentAvatar,
  type AccessoryId,
  type FaceId,
  type HairColorId,
  type HairStyleId,
  type OutfitId,
  type SkinToneId,
} from "./student-avatar";

type FrameId = "core" | "signal" | "orbit" | "constellation";
type PatchId = "none" | "nearby" | "relay";
type MotionId = "still" | "drift" | "spin" | "pulse";
type StudioTab = "character" | "style" | "effects";
type LauraTab = "outfits" | "expressions" | "accessories" | "backgrounds";
type ProductVisual = { name: string; kind: "frame" | "patch" | "motion"; value: FrameId | PatchId | MotionId; asset: string };
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

const STUDIO_TABS: ReadonlyArray<{ id: StudioTab; label: string; symbol: string }> = [
  { id: "character", label: "Classic face", symbol: "◡" },
  { id: "style", label: "Classic style", symbol: "♧" },
  { id: "effects", label: "Classic effects", symbol: "✦" },
];

const SKIN_TONES: ReadonlyArray<{ id: SkinToneId; label: string; color: string }> = [
  { id: "porcelain", label: "Porcelain", color: "#F6D2BD" },
  { id: "sand", label: "Sand", color: "#E9B68F" },
  { id: "golden", label: "Golden", color: "#CC8B58" },
  { id: "umber", label: "Umber", color: "#A96643" },
  { id: "cocoa", label: "Cocoa", color: "#75442F" },
  { id: "ebony", label: "Ebony", color: "#4A2B24" },
];

const FACES: ReadonlyArray<{ id: FaceId; label: string }> = [
  { id: "smile", label: "Smile" },
  { id: "focused", label: "Focused" },
  { id: "wink", label: "Wink" },
];

const HAIR_STYLES: ReadonlyArray<{ id: HairStyleId; label: string }> = [
  { id: "crop", label: "Crop" },
  { id: "curls", label: "Curls" },
  { id: "locs", label: "Locs" },
  { id: "bob", label: "Bob" },
];

const HAIR_COLORS: ReadonlyArray<{ id: HairColorId; label: string; color: string }> = [
  { id: "ink", label: "Ink", color: "#17171B" },
  { id: "chestnut", label: "Chestnut", color: "#4A2C25" },
  { id: "auburn", label: "Auburn", color: "#7C3529" },
  { id: "violet", label: "Violet", color: "#51345D" },
];

const OUTFITS: ReadonlyArray<{ id: OutfitId; label: string }> = [
  { id: "tee", label: "Signal tee" },
  { id: "hoodie", label: "Campus hoodie" },
  { id: "tech", label: "Tech jacket" },
];

const ACCESSORIES: ReadonlyArray<{ id: AccessoryId; label: string }> = [
  { id: "none", label: "None" },
  { id: "glasses", label: "Glasses" },
  { id: "headphones", label: "Headphones" },
];

const FRAMES: ReadonlyArray<{ id: FrameId; label: string; asset: string; sku?: string }> = [
  { id: "core", label: "Core ring", asset: "/brand/avatar-frame-core.svg" },
  { id: "signal", label: "Signal arcs", asset: "/brand/avatar-frame-signal.svg" },
  { id: "orbit", label: "Open orbit", asset: "/brand/avatar-frame-orbit.svg" },
  { id: "constellation", label: "Constellation", asset: "/brand/avatar-frame-constellation.svg", sku: "profile-frame" },
];

const PATCHES: ReadonlyArray<{ id: PatchId; label: string; asset?: string; sku?: string }> = [
  { id: "none", label: "No patch" },
  { id: "nearby", label: "Nearby", asset: "/brand/profile-patch-nearby.svg" },
  { id: "relay", label: "Trust relay", asset: "/brand/profile-patch-relay.svg", sku: "trust-badge" },
];

const MOTIONS: ReadonlyArray<{ id: MotionId; label: string; asset?: string; sku?: string }> = [
  { id: "still", label: "Still" },
  { id: "drift", label: "Slow drift", asset: "/brand/avatar-motion-drift.svg" },
  { id: "spin", label: "Orbit spin", asset: "/brand/avatar-motion-spin.svg" },
  { id: "pulse", label: "Campus pulse", asset: "/brand/avatar-motion-pulse.svg", sku: "campus-theme" },
];

const PRODUCT_VISUALS: Record<string, ProductVisual> = {
  "profile-frame": { name: "Constellation frame", kind: "frame", value: "constellation", asset: "/brand/avatar-frame-constellation.svg" },
  "campus-theme": { name: "Campus pulse", kind: "motion", value: "pulse", asset: "/brand/avatar-motion-pulse.svg" },
  "trust-badge": { name: "Trust relay patch", kind: "patch", value: "relay", asset: "/brand/profile-patch-relay.svg" },
};

const REWARD_VISUALS: Record<string, { kind: "frame" | "patch" | "motion"; asset: string }> = {
  "reward-frame-mint": { kind: "frame", asset: "/brand/avatar-frame-mint.svg" },
  "reward-frame-solar": { kind: "frame", asset: "/brand/avatar-frame-solar.svg" },
  "reward-patch-nearby": { kind: "patch", asset: "/brand/profile-patch-nearby.svg" },
  "reward-motion-drift": { kind: "motion", asset: "/brand/avatar-motion-drift.svg" },
};

function formatSol(lamports: number) {
  return `${(lamports / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
}

function shortAddress(address: string) {
  if (address.length < 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
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
  if (item.unlockMethod === "reward_points") return `${item.rewardPoints} points`;
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

function LayerLock({ sku, catalog }: { sku?: string; catalog: Map<string, CosmeticProjection> }) {
  if (!sku) return <span className="layer-access is-preview">Preview</span>;
  const product = catalog.get(sku);
  if (product?.owned) return <span className="layer-access is-owned"><Check size={10} /> Owned</span>;
  return <span className="layer-access is-premium"><LockKeyhole size={10} /> Devnet</span>;
}

export function AvatarStudio({
  profile,
  catalog,
  catalogStatus,
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
  const [studioTab, setStudioTab] = useState<StudioTab>("character");
  const [skin, setSkin] = useState<SkinToneId>(profile?.avatarConfig.skin ?? "golden");
  const [face, setFace] = useState<FaceId>(profile?.avatarConfig.face ?? "smile");
  const [hair, setHair] = useState<HairStyleId>(profile?.avatarConfig.hair ?? "curls");
  const [hairColor, setHairColor] = useState<HairColorId>(profile?.avatarConfig.hairColor ?? "ink");
  const [outfit, setOutfit] = useState<OutfitId>(profile?.avatarConfig.outfit ?? "hoodie");
  const [accessory, setAccessory] = useState<AccessoryId>(profile?.avatarConfig.accessory ?? "headphones");
  const [avatarSaveState, setAvatarSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [frameSelection, setFrame] = useState<FrameId | null>(null);
  const [patchSelection, setPatch] = useState<PatchId | null>(null);
  const [motionSelection, setMotion] = useState<MotionId | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<CosmeticProjection | null>(null);
  const [quote, setQuote] = useState<CosmeticQuote | null>(null);
  const [signature, setSignature] = useState("");
  const [purchaseState, setPurchaseState] = useState<PurchaseState>("idle");
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [unlockResult, setUnlockResult] = useState<CosmeticUnlockResult | null>(null);
  const [verifiedSignature, setVerifiedSignature] = useState<string | null>(null);
  const [equipBusySku, setEquipBusySku] = useState<string | null>(null);
  const [equipMessage, setEquipMessage] = useState("");
  const [lauraTab, setLauraTab] = useState<LauraTab>("outfits");
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
  const checkoutTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!profile || !persistedAvatarKey || hydratedAvatarKey.current === persistedAvatarKey) return;
    hydratedAvatarKey.current = persistedAvatarKey;
    setSkin(profile.avatarConfig.skin);
    setFace(profile.avatarConfig.face);
    setHair(profile.avatarConfig.hair);
    setHairColor(profile.avatarConfig.hairColor);
    setOutfit(profile.avatarConfig.outfit);
    setAccessory(profile.avatarConfig.accessory);
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

  const catalogBySku = useMemo(() => new Map(catalog.map((item) => [item.sku, item])), [catalog]);
  const supportedProducts = catalog.filter((item) => Boolean(PRODUCT_VISUALS[item.sku]));
  const ownedProducts = supportedProducts.filter((item) => item.owned);
  const premiumProducts = supportedProducts.filter((item) => !item.owned);
  const equippedVisuals = catalog.filter((item) => item.equipped).map((item) => PRODUCT_VISUALS[item.sku]).filter(Boolean);
  const equippedFrame = equippedVisuals.find((item) => item.kind === "frame");
  const equippedPatch = equippedVisuals.find((item) => item.kind === "patch");
  const equippedMotion = equippedVisuals.find((item) => item.kind === "motion");
  const frame = frameSelection ?? (equippedFrame?.value as FrameId | undefined) ?? "signal";
  const patch = patchSelection ?? (equippedPatch?.value as PatchId | undefined) ?? "none";
  const motion = motionSelection ?? (equippedMotion?.value as MotionId | undefined) ?? "drift";
  const frameOption = FRAMES.find((item) => item.id === frame) ?? FRAMES[0];
  const patchOption = PATCHES.find((item) => item.id === patch) ?? PATCHES[0];
  const motionOption = MOTIONS.find((item) => item.id === motion) ?? MOTIONS[0];
  const selectedSkus = [frameOption.sku, patchOption.sku, motionOption.sku].filter(Boolean) as string[];
  const lockedSkus = selectedSkus.filter((sku) => !catalogBySku.get(sku)?.owned);
  const compositionStatus = lockedSkus.length ? "Preview contains a locked Devnet layer" : "Base saves · effects preview only";
  const wallet = profile?.solanaWallet ?? null;
  const avatarConfig: AvatarConfig = { skin, face, hair, hairColor, outfit, accessory };
  const savedAvatar = profile?.avatarConfig;
  const avatarDirty = Boolean(savedAvatar) && Object.entries(avatarConfig).some(([key, value]) => savedAvatar?.[key as keyof AvatarConfig] !== value);
  const currentLookName = `${HAIR_STYLES.find((item) => item.id === hair)?.label ?? hair} + ${OUTFITS.find((item) => item.id === outfit)?.label ?? outfit}`;
  const currentLookSummary = `${FACES.find((item) => item.id === face)?.label ?? face} face · ${ACCESSORIES.find((item) => item.id === accessory)?.label ?? accessory}`;
  const editorHeading = studioTab === "character" ? "Choose your expression." : studioTab === "style" ? "Find your fit." : "Add your signal.";
  const editorBoundary = studioTab === "effects" ? "DEVNET VERIFIED" : "PROFILE SYNC";
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
  const activeBackground = activeInGroup("background", backgroundItems);
  const activeAccessoryItems = Array.from(new Set(accessoryItems.map((item) => item.equipGroup))).map((group) => {
    const previewSku = avatarPreviewByGroup[group];
    if (previewSku === "") return undefined;
    return accessoryItems.find((item) => item.sku === previewSku) ?? accessoryItems.find((item) => item.equipGroup === group && item.equipped);
  }).filter((item): item is AvatarMarketplaceProjection => Boolean(item));
  const topIndex = Math.max(0, topItems.findIndex((item) => item.sku === activeTop?.sku));
  const bottomIndex = Math.max(0, bottomItems.findIndex((item) => item.sku === activeBottom?.sku));
  const activeCharacterAsset = LAURA_MANIFEST.characters.find((item) => item.collection === activeCollection && item.top === topIndex && item.bottom === bottomIndex && item.face === (activeExpression?.value ?? "default"));
  const activeBackgroundAsset = LAURA_MANIFEST.backgrounds.find((item) => item.id === activeBackground?.value);
  const activeAccessoryAssets = activeAccessoryItems.map((item) => LAURA_MANIFEST.accessories.find((asset) => asset.id === item.value)).filter((item): item is LauraAccessoryAsset => Boolean(item));
  const rewardItems = avatarMarketplace.filter((item) => item.unlockMethod === "reward_points" && Boolean(REWARD_VISUALS[item.sku]));
  const activeRewardItems = rewardItems.filter((item) => {
    if (Object.hasOwn(avatarPreviewByGroup, item.equipGroup)) return avatarPreviewByGroup[item.equipGroup] === item.sku;
    return item.equipped;
  });
  const hasLocalAvatarPreview = previewMode || Object.keys(avatarPreviewByGroup).length > 0;
  const hasPlaceholderAssets = avatarMarketplace.some((item) => item.assetStatus === "placeholder");

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

  function applyProduct(sku: string) {
    const visual = PRODUCT_VISUALS[sku];
    if (!visual) return;
    if (visual.kind === "frame") setFrame(visual.value as FrameId);
    if (visual.kind === "patch") setPatch(visual.value as PatchId);
    if (visual.kind === "motion") setMotion(visual.value as MotionId);
  }

  function previewProduct(item: CosmeticProjection, trigger?: HTMLButtonElement | null) {
    checkoutTrigger.current = trigger ?? checkoutTrigger.current;
    applyProduct(item.sku);
    setSelectedProduct(item);
    setPurchaseState("idle");
    setQuote(null);
    setSignature("");
    setUnlockResult(null);
    setVerifiedSignature(null);
    setPurchaseMessage("");
  }

  function closeCheckout() {
    setSelectedProduct(null);
    window.requestAnimationFrame(() => checkoutTrigger.current?.focus());
  }

  function moveStudioTab(event: KeyboardEvent<HTMLButtonElement>, currentTab: StudioTab) {
    const currentIndex = STUDIO_TABS.findIndex((tab) => tab.id === currentTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % STUDIO_TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + STUDIO_TABS.length) % STUDIO_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = STUDIO_TABS.length - 1;
    if (nextIndex === currentIndex) return;
    event.preventDefault();
    const nextTab = STUDIO_TABS[nextIndex].id;
    setStudioTab(nextTab);
    document.getElementById(`avatar-tab-${nextTab}`)?.focus();
  }

  async function equipOwnedProduct(item: CosmeticProjection) {
    applyProduct(item.sku);
    if (previewMode) return;
    setEquipBusySku(item.sku);
    setEquipMessage("");
    try {
      const result = await equipCosmetic(item.sku);
      if (result.equipped !== item.sku) throw new ApiError("The equipped cosmetic did not match the selected item.", 502, "invalid_response");
      setEquipMessage(`${PRODUCT_VISUALS[item.sku]?.name ?? item.label} equipped.`);
      try {
        onCatalogChange(await getCosmetics());
      } catch {
        setEquipMessage("Equipped on the server. Refresh to update the ownership view.");
      }
    } catch (error) {
      setEquipMessage(error instanceof Error ? error.message : "This owned item could not be equipped.");
    } finally {
      setEquipBusySku(null);
    }
  }

  async function requestQuote(item: CosmeticProjection) {
    previewProduct(item);
    if (previewMode) return;
    setPurchaseState("quoting");
    try {
      const nextQuote = await getCosmeticQuote(item.sku);
      if (nextQuote.network !== "devnet" || nextQuote.productId !== item.sku || nextQuote.lamports !== item.lamports) {
        throw new ApiError("The Devnet quote did not match the selected catalog item.", 502, "invalid_response");
      }
      setQuote(nextQuote);
      setPurchaseState("ready");
    } catch (error) {
      const failure = errorCopy(error);
      setPurchaseState(failure.state);
      setPurchaseMessage(failure.message);
    }
  }

  async function acceptVerifiedUnlock(result: CosmeticUnlockResult, usedSignature: string) {
    if (!selectedProduct || !quote || !wallet) throw new ApiError("The active Devnet checkout changed.", 409, "invalid_response");
    if (!result.verified || result.network !== "devnet" || result.productId !== selectedProduct.sku || result.lamports !== quote.lamports) {
      throw new ApiError("The verified unlock did not match the selected quote.", 502, "invalid_response");
    }
    setUnlockResult(result);
    setVerifiedSignature(usedSignature);
    setPurchaseState("verified");
    setPurchaseMessage("Verified on Devnet. The cosmetic is now owned.");
    applyProduct(result.productId);
    try {
      onCatalogChange(await getCosmetics());
    } catch {
      setPurchaseMessage("Verified on Devnet. Refresh to update the ownership view.");
    }
  }

  async function verifySignature(event: FormEvent) {
    event.preventDefault();
    if (!selectedProduct || !quote || !wallet || !signature.trim()) return;
    setPurchaseState("verifying");
    setPurchaseMessage("");
    try {
      const cleanSignature = signature.trim();
      const result = await unlockCosmetic(selectedProduct.sku, cleanSignature, quote.checkoutId);
      await acceptVerifiedUnlock(result, cleanSignature);
    } catch (error) {
      const failure = errorCopy(error);
      setPurchaseState(failure.state);
      setPurchaseMessage(failure.message);
    }
  }

  async function copyQuoteValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setPurchaseMessage("Copied to clipboard.");
    } catch {
      setPurchaseMessage("Copy was blocked. Select the value manually.");
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
      await setAvatarMarketplaceItem(item.sku, true);
      await refreshAvatarMarketplace();
      setAvatarPreviewByGroup((current) => {
        const next = { ...current };
        delete next[item.equipGroup];
        return next;
      });
      setSelectedAvatarItem(null);
      setAvatarPurchaseMessage(`${item.label} unlocked with earned points and equipped.`);
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
    await setAvatarMarketplaceItem(selectedAvatarItem.sku, true);
    await refreshAvatarMarketplace();
    setAvatarPreviewByGroup((current) => {
      const next = { ...current };
      delete next[selectedAvatarItem.equipGroup];
      return next;
    });
    setAvatarUnlockResult(result);
    setAvatarVerifiedSignature(usedSignature);
    setAvatarPurchaseState("verified");
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
      <p className="section-copy avatar-studio-intro">Compose original HitMeUp vector looks through the server-backed marketplace, or keep editing the compatible classic avatar below.</p>

      <div className="avatar-access-guide" aria-label="Avatar customization access">
        <div><span className="access-guide-icon is-included" aria-hidden="true"><Check size={16} /></span><p><strong>Included + earned</strong><span>Equip free pieces now or spend non-cash points earned from completed, mutually rated services.</span></p></div>
        <div><span className="access-guide-icon is-collectible" aria-hidden="true"><Sparkles size={16} /></span><p><strong>Devnet collection</strong><span>Premium pieces unlock through the verified test-token flow. Artwork is original SVG; ownership still comes only from the backend.</span></p></div>
      </div>

      <section className="laura-avatar-marketplace" aria-labelledby="laura-marketplace-heading">
        <div className="laura-marketplace-bar">
          <div><span className="section-kicker">HITMEUP ORIGINALS · SERVER BACKED</span><h3 id="laura-marketplace-heading">Build the full look.</h3></div>
          <div className="reward-balance" aria-label="HitMeUp points balance"><Coins size={16} /><span>{rewardsStatus === "loading" ? "Loading points…" : rewardsStatus === "error" ? "Points unavailable" : <><strong>{rewards?.balance ?? 0}</strong> points</>}</span></div>
        </div>

        {avatarMarketplaceStatus === "loading" && <div className="laura-marketplace-state" role="status"><LoaderCircle className="spin" size={18} /> Loading your server-owned avatar collection…</div>}
        {avatarMarketplaceStatus === "error" && <div className="laura-marketplace-state is-error" role="alert"><ShieldCheck size={18} /><span>{avatarMarketplaceMessage || "The avatar collection is unavailable."} Your classic avatar remains unchanged.</span></div>}

        {avatarMarketplaceStatus === "ready" && <>
          {hasPlaceholderAssets && <div className="avatar-asset-notice" role="note"><ShieldCheck size={17} /><p><strong>Server review gate</strong><span>The production-safe HitMeUp SVG pack is present, but some catalog entries are still marked for backend review. Those options remain preview-only until the server approves them.</span></p></div>}
          <div className="laura-workspace">
            <div className="laura-preview-panel">
              <div className="avatar-preview-top"><span>01 / YOUR CHARACTER</span><span>{hasLocalAvatarPreview ? "LOCAL ART PREVIEW" : "SERVER LOADOUT"}</span></div>
              <div className={`laura-stage laura-background-${activeBackgroundAsset?.pattern ?? activeBackgroundAsset?.id ?? "signal"}`} style={backgroundStyle(activeBackgroundAsset)}>
                <span className="avatar-stage-note" aria-hidden="true">YOUR AVATAR.<br />YOUR STORY.</span>
                {activeCharacterAsset ? <div className="laura-character-canvas" role="img" aria-label={`${activeCollection} avatar wearing ${activeTop?.label ?? "default top"}, ${activeBottom?.label ?? "default bottom"}, ${activeExpression?.label ?? "default expression"}, with ${activeAccessoryItems.length} accessories and ${activeBackground?.label ?? "signal background"}`}>
                  <Image key={activeCharacterAsset.file} className="laura-character-art" src={activeCharacterAsset.file} alt="" width={activeCharacterAsset.pixelWidth} height={activeCharacterAsset.pixelHeight} priority />
                  {activeAccessoryAssets.map((asset) => <Image key={asset.id} className="laura-accessory-art" src={asset.file} alt="" width={asset.pixelWidth} height={asset.pixelHeight} style={accessoryPlacement(asset, activeCharacterAsset)} />)}
                  {activeRewardItems.map((item) => {
                    const visual = REWARD_VISUALS[item.sku];
                    return <Image key={item.sku} className={`laura-reward-layer is-${visual.kind}`} src={visual.asset} alt="" width={560} height={560} />;
                  })}
                </div> : <div className="laura-art-missing" role="status">This look asset is unavailable.</div>}
                <span className="avatar-stage-sticker" aria-hidden="true">100% YOU</span>
              </div>
              <div className="avatar-preview-bottom">
                <div><span>YOUR CURRENT LOOK</span><strong>{activeTop?.label ?? "Original look"}</strong><small>{activeCollection === "female" ? "Female" : "Male"} · {activeBottom?.label ?? "Default bottom"} · {activeExpression?.label ?? "Default"}</small></div>
                <span className={`server-loadout-mark ${hasLocalAvatarPreview ? "is-preview" : ""}`}><ShieldCheck size={15} />{hasLocalAvatarPreview ? "Preview only" : "Backend loadout"}</span>
              </div>
              <div className="avatar-profile-sync"><span>{activeAccessoryItems.length} ACCESSOR{activeAccessoryItems.length === 1 ? "Y" : "IES"} {hasLocalAvatarPreview ? "PREVIEWED" : "EQUIPPED"}</span><span>{hasLocalAvatarPreview ? "PREVIEW IS NOT OWNERSHIP" : "OWNERSHIP VERIFIED SERVER-SIDE"}</span></div>
            </div>

            <div className="laura-editor">
              <div className="laura-character-switch" role="group" aria-label="Avatar collection">
                {collectionItems.map((item) => <button type="button" key={item.sku} aria-pressed={isAvatarItemActive(item)} className={isAvatarItemActive(item) ? "is-active" : ""} onClick={() => void chooseAvatarItem(item)} disabled={Boolean(avatarMarketplaceBusySku)}><span className="collection-symbol" aria-hidden="true">{item.value === "female" ? "♀" : "♂"}</span><span><strong>{item.value === "female" ? "Female" : "Male"}</strong><small>{item.value === "female" ? "A new energy" : "The original"}</small></span><Check className="collection-check" size={16} aria-hidden="true" /></button>)}
              </div>
              <div className="avatar-editor-title"><div><span>{activeCollection.toUpperCase()} COLLECTION</span><h3>{lauraTab === "outfits" ? "Find your fit." : lauraTab === "expressions" ? "Set the expression." : lauraTab === "accessories" ? "Make it your own." : "Set the scene."}</h3></div><span>{activeAccessoryItems.length} EQUIPPED</span></div>
              <div className="laura-category-tabs" role="tablist" aria-label="HitMeUp avatar customization">
                {LAURA_TABS.map(({ id, label, symbol }) => <button key={id} id={`laura-avatar-tab-${id}`} type="button" role="tab" aria-selected={lauraTab === id} aria-controls={`laura-avatar-panel-${id}`} tabIndex={lauraTab === id ? 0 : -1} className={lauraTab === id ? "is-active" : ""} onClick={() => setLauraTab(id)} onKeyDown={(event) => moveLauraTab(event, id)}><span aria-hidden="true">{symbol}</span>{label}</button>)}
              </div>

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
            <div className="laura-option-heading"><div><span className="section-kicker">EARNED, NEVER BOUGHT</span><strong id="laura-reward-heading">Service reward collectibles</strong></div><span>{rewardItems.length} pieces · {rewards?.balance ?? 0} points available</span></div>
            <p>Spend non-cash points earned only after a service is completed and mutually rated. The backend sets the price, ownership and equipped state.</p>
            <div className="laura-option-grid reward-grid">{rewardItems.map(lauraOptionTile)}</div>
          </section>}

          {avatarMarketplaceMessage && <p className="avatar-marketplace-message" role="status">{avatarMarketplaceMessage}</p>}
          {selectedAvatarItem && !selectedAvatarItem.owned && <section className="avatar-unlock-panel" aria-labelledby="avatar-unlock-heading">
            <div className="checkout-heading"><div><span className="section-kicker">{selectedAvatarItem.unlockMethod === "reward_points" ? "EARNED REWARD" : "SOLANA DEVNET BUNDLE"}</span><h3 id="avatar-unlock-heading">Unlock {selectedAvatarItem.label}</h3></div><button className="icon-button" type="button" aria-label="Close avatar unlock" onClick={() => { setSelectedAvatarItem(null); setAvatarQuote(null); }}><X size={17} /></button></div>
            <p className="zone-intro">The visual is previewed above, but it is not owned or equipped until the server confirms the correct unlock method.</p>
            {selectedAvatarItem.unlockMethod === "reward_points" && <div className="reward-unlock-card"><Coins size={22} /><div><strong>{selectedAvatarItem.rewardPoints} earned points</strong><span>Your balance: {rewards?.balance ?? 0}. Points are non-cash and come only from fully closed student services.</span></div><button type="button" disabled={previewMode || rewardsStatus !== "ready" || (rewards?.balance ?? 0) < selectedAvatarItem.rewardPoints || avatarMarketplaceBusySku === selectedAvatarItem.sku} onClick={() => void unlockAvatarReward(selectedAvatarItem)}>{previewMode ? "Live app only" : (rewards?.balance ?? 0) < selectedAvatarItem.rewardPoints ? "More points needed" : avatarMarketplaceBusySku ? "Unlocking…" : "Unlock with points"}</button></div>}
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

      <details className="classic-avatar-compatibility">
        <summary><span><strong>Classic vector avatar</strong><small>Keep editing the original six-field profile avatar and three existing SVG collectibles.</small></span><span>Compatibility editor</span></summary>
      <div className="studio-layout studio-layout-expanded">
        <div className="avatar-preview-panel">
          <div className="avatar-preview-top"><span>01 / YOUR CHARACTER</span><span>LIVE PROFILE PREVIEW</span></div>
          <div className="avatar-stage">
            <div className="avatar-stage-grid" aria-hidden="true" />
            <span className="avatar-stage-note" aria-hidden="true">YOUR AVATAR.<br />YOUR STORY.</span>
            <div className={`avatar-preview avatar-motion-${motion}`} role="img" aria-label={`Illustrated student avatar with ${hair} hair, ${outfit}, ${accessory}, ${frameOption.label} frame, ${patchOption.label}, and ${motionOption.label} motion`}>
              <StudentAvatar className="avatar-figure-layer" skin={skin} hair={hair} hairColor={hairColor} face={face} outfit={outfit} accessory={accessory} title="" />
              <Image className="avatar-frame-layer" src={frameOption.asset} alt="" fill sizes="(max-width: 700px) 172px, 216px" priority />
              {patchOption.asset && <Image className="avatar-patch-layer" src={patchOption.asset} alt="" width={58} height={58} />}
              {motionOption.asset && <span className="avatar-motion-layer" aria-hidden="true" style={{ "--motion-mask": `url(${motionOption.asset})` } as CSSProperties} />}
            </div>
            <span className="avatar-stage-sticker" aria-hidden="true">100% YOU</span>
            <div className={`composition-status ${lockedSkus.length ? "is-locked" : "is-preview"}`}><span />{compositionStatus}</div>
          </div>
          <div className="avatar-preview-bottom">
            <div><span>YOUR CURRENT LOOK</span><strong>{currentLookName}</strong><small>{currentLookSummary}</small></div>
            <button className="save-avatar-button" type="button" disabled={previewMode || !profile || !avatarDirty || avatarSaveState === "saving"} onClick={() => void saveAvatar()}>{avatarSaveState === "saving" ? <><LoaderCircle className="spin" size={14} /> Saving…</> : previewMode ? "Save in live app" : avatarSaveState === "saved" ? <><Check size={14} /> Saved</> : <>Save look <span aria-hidden="true">↗</span></>}</button>
          </div>
          <div className="avatar-profile-sync"><span>{avatarSaveState === "saved" ? "Synced now" : avatarDirty ? "Unsaved changes" : "Profile up to date"}</span><span>SAVED TO YOUR PROFILE · NOT THIS BROWSER</span></div>
          {avatarSaveState === "saved" && <p className="avatar-save-status" role="status">Avatar saved to your profile.</p>}
          {avatarSaveState === "error" && <p className="avatar-save-status is-error" role="alert">The avatar could not be saved. Your previous profile stays unchanged.</p>}
        </div>

        <div className="studio-controls-stack">
          <div className="avatar-editor-title">
            <div><span>HITMEUP COLLECTION</span><h3>{editorHeading}</h3></div>
            <span>{editorBoundary}</span>
          </div>
          <div className="studio-tabs" role="tablist" aria-label="Avatar customization">
            {STUDIO_TABS.map(({ id, label, symbol }) => <button key={id} id={`avatar-tab-${id}`} type="button" role="tab" aria-selected={studioTab === id} aria-controls={`avatar-panel-${id}`} tabIndex={studioTab === id ? 0 : -1} className={studioTab === id ? "selected" : ""} onKeyDown={(event) => moveStudioTab(event, id)} onClick={() => setStudioTab(id)}><span aria-hidden="true">{symbol}</span>{label}</button>)}
          </div>

          {studioTab === "character" && <div className="studio-tab-panel" id="avatar-panel-character" role="tabpanel" aria-labelledby="avatar-tab-character">
            <fieldset className="studio-control-group skin-control">
              <legend><span>Skin tone</span><em>Free</em></legend>
              <div>{SKIN_TONES.map((item) => <button className={skin === item.id ? "selected" : ""} aria-pressed={skin === item.id} type="button" key={item.id} aria-label={`${item.label} skin tone, free`} onClick={() => updateAvatarField(skin, item.id, setSkin)}><i style={{ backgroundColor: item.color }} /><span>{item.label}</span></button>)}</div>
            </fieldset>
            <fieldset className="studio-control-group avatar-choice-control">
              <legend><span>Face</span><em>Free</em></legend>
              <div>{FACES.map((item) => <button className={face === item.id ? "selected" : ""} aria-pressed={face === item.id} type="button" key={item.id} onClick={() => updateAvatarField(face, item.id, setFace)}><StudentAvatar skin={skin} hair={hair} hairColor={hairColor} face={item.id} outfit={outfit} accessory="none" title="" /><span>{item.label}</span></button>)}</div>
            </fieldset>
          </div>}

          {studioTab === "style" && <div className="studio-tab-panel" id="avatar-panel-style" role="tabpanel" aria-labelledby="avatar-tab-style">
            <fieldset className="studio-control-group avatar-choice-control">
              <legend><span>Hair</span><em>Free</em></legend>
              <div className="studio-control-grid-wide">{HAIR_STYLES.map((item) => <button className={hair === item.id ? "selected" : ""} aria-pressed={hair === item.id} type="button" key={item.id} onClick={() => updateAvatarField(hair, item.id, setHair)}><StudentAvatar skin={skin} hair={item.id} hairColor={hairColor} face={face} outfit={outfit} accessory="none" title="" /><span>{item.label}</span></button>)}</div>
            </fieldset>
            <fieldset className="studio-control-group skin-control">
              <legend><span>Hair color</span><em>Free</em></legend>
              <div className="hair-color-grid">{HAIR_COLORS.map((item) => <button className={hairColor === item.id ? "selected" : ""} aria-pressed={hairColor === item.id} type="button" key={item.id} aria-label={`${item.label} hair color, free`} onClick={() => updateAvatarField(hairColor, item.id, setHairColor)}><i style={{ backgroundColor: item.color }} /><span>{item.label}</span></button>)}</div>
            </fieldset>
            <fieldset className="studio-control-group">
              <legend><span>Outfit</span><em>Free</em></legend>
              <div>{OUTFITS.map((item) => <button className={outfit === item.id ? "selected" : ""} aria-pressed={outfit === item.id} type="button" key={item.id} onClick={() => updateAvatarField(outfit, item.id, setOutfit)}>{item.label}</button>)}</div>
            </fieldset>
            <fieldset className="studio-control-group">
              <legend><span>Accessory</span><em>Free</em></legend>
              <div>{ACCESSORIES.map((item) => <button className={accessory === item.id ? "selected" : ""} aria-pressed={accessory === item.id} type="button" key={item.id} onClick={() => updateAvatarField(accessory, item.id, setAccessory)}>{item.label}</button>)}</div>
            </fieldset>
          </div>}

          {studioTab === "effects" && <div className="studio-tab-panel" id="avatar-panel-effects" role="tabpanel" aria-labelledby="avatar-tab-effects">
            <fieldset className="studio-control-group layer-choice-control">
              <legend><span>Frame</span><em>Preview + Devnet</em></legend>
              <div className="studio-control-grid-wide">{FRAMES.map((item) => <button className={frame === item.id ? "selected" : ""} aria-pressed={frame === item.id} type="button" key={item.id} onClick={() => setFrame(item.id)}><span className="layer-thumb"><Image src={item.asset} alt="" width={38} height={38} /></span><span>{item.label}</span><LayerLock sku={item.sku} catalog={catalogBySku} /></button>)}</div>
            </fieldset>
            <div className="studio-control-row">
              <fieldset className="studio-control-group layer-choice-control">
                <legend><span>Patch</span></legend>
                <div>{PATCHES.map((item) => <button className={patch === item.id ? "selected" : ""} aria-pressed={patch === item.id} type="button" key={item.id} onClick={() => setPatch(item.id)}><span className={`layer-thumb ${item.asset ? "" : "is-empty"}`}>{item.asset ? <Image src={item.asset} alt="" width={38} height={38} /> : <X size={18} />}</span><span>{item.label}</span><LayerLock sku={item.sku} catalog={catalogBySku} /></button>)}</div>
              </fieldset>
              <fieldset className="studio-control-group layer-choice-control motion-control">
                <legend><span>Motion</span></legend>
                <div>{MOTIONS.map((item) => <button className={motion === item.id ? `selected motion-option-${item.id}` : `motion-option-${item.id}`} aria-pressed={motion === item.id} type="button" key={item.id} onClick={() => setMotion(item.id)}><span className={`layer-thumb ${item.asset ? "" : "is-empty"}`}>{item.asset ? <Image src={item.asset} alt="" width={38} height={38} /> : <span className="still-dot" />}</span><span>{item.label}</span><LayerLock sku={item.sku} catalog={catalogBySku} /></button>)}</div>
              </fieldset>
            </div>
          </div>}
          <div className="avatar-editor-foot"><span>SMALL DETAILS. BIG PERSONALITY.</span><span>Free choices sync only when you save.</span></div>
        </div>
      </div>

      <div className="cosmetic-zones">
        <section className="cosmetic-zone owned-zone" aria-labelledby="owned-cosmetics-title">
          <div className="zone-heading"><div><span className="section-kicker">OWNED</span><h3 id="owned-cosmetics-title">Your locker</h3></div><BadgeCheck size={18} /></div>
          {catalogStatus === "loading" && <div className="catalog-state" role="status"><LoaderCircle className="spin" size={16} /> Loading ownership…</div>}
          {catalogStatus === "error" && <div className="catalog-state is-error" role="alert">Ownership could not be loaded. No premium item is assumed owned.</div>}
          {catalogStatus === "ready" && !ownedProducts.length && <div className="catalog-state">No verified Devnet cosmetics yet. Your free kit stays available.</div>}
          <div className="owned-list">{ownedProducts.map((item) => {
            const visual = PRODUCT_VISUALS[item.sku];
            return <article className="owned-item" key={item.sku}>
              {visual ? <Image src={visual.asset} alt="" width={42} height={42} /> : <Sparkles size={25} />}
              <div><strong>{visual?.name ?? item.label}</strong><span>{item.equipped ? "Equipped on profile" : "Verified ownership"}</span></div>
              <button type="button" disabled={Boolean(equipBusySku) || previewMode} onClick={() => void equipOwnedProduct(item)}>{equipBusySku === item.sku ? <LoaderCircle className="spin" size={14} /> : item.equipped ? "Reapply" : "Use"}</button>
            </article>;
          })}</div>
          {previewMode && ownedProducts.length > 0 && <p className="zone-note">Ownership shown here is preview data. Live equip actions are disabled.</p>}
          {equipMessage && <p className="zone-note" role="status">{equipMessage}</p>}
        </section>

        <section className="cosmetic-zone devnet-zone" aria-labelledby="devnet-catalog-title">
          <div className="zone-heading"><div><span className="section-kicker">OPTIONAL · DEVNET</span><h3 id="devnet-catalog-title">Collectible layers</h3></div><span className="network-pill">Test currency</span></div>
          <p className="zone-intro"><strong>No real money:</strong> cosmetics use Solana Devnet test tokens only. They decorate profiles; student service payments remain off-platform and between students.</p>
          <ol className="solana-story" aria-label="Solana Devnet cosmetic flow"><li><span>1</span><strong>Preview</strong></li><li><span>2</span><strong>Connect</strong></li><li><span>3</span><strong>Verify on-chain</strong></li><li><span>4</span><strong>Equip</strong></li></ol>
          <div className="premium-grid">{premiumProducts.map((item) => {
            const visual = PRODUCT_VISUALS[item.sku];
            return <article className="premium-item" key={item.sku}>
              <div className="premium-asset">{visual ? <Image src={visual.asset} alt="" fill sizes="82px" /> : <Sparkles size={28} />}</div>
              <div><span>{item.label}</span><strong>{visual?.name ?? item.label}</strong><small>{formatSol(item.lamports)} · {item.lamports.toLocaleString()} lamports</small></div>
              <div className="premium-actions"><button className="text-button" type="button" onClick={(event) => previewProduct(item, event.currentTarget)}>Preview</button><button className="unlock-button" type="button" disabled={previewMode || purchaseState === "quoting" || purchaseState === "verifying"} onClick={(event) => { checkoutTrigger.current = event.currentTarget; void requestQuote(item); }}>{previewMode ? "Live app only" : "Unlock on Devnet"}</button></div>
            </article>;
          })}</div>
          {catalogStatus === "ready" && !premiumProducts.length && <div className="catalog-state">{supportedProducts.length ? "Everything in the supported Devnet catalog is owned." : "No supported collectible layers are available in this build."}</div>}
        </section>
      </div>

      {selectedProduct && !selectedProduct.owned && (
        <section className="devnet-checkout" aria-labelledby="devnet-checkout-title">
          <div className="checkout-heading">
            <div><span className="section-kicker">REAL DEVNET VERIFICATION</span><h3 id="devnet-checkout-title">Unlock {PRODUCT_VISUALS[selectedProduct.sku]?.name ?? selectedProduct.label}</h3></div>
            <button className="icon-button" type="button" aria-label="Close Devnet unlock" onClick={closeCheckout}><X size={17} /></button>
          </div>
          {previewMode ? <div className="checkout-notice"><ShieldCheck size={18} /><div><strong>Preview mode</strong><p>No quote, wallet action or transaction is created in this sample view.</p></div></div> : (
            <>
              {purchaseState === "quoting" && <div className="checkout-notice" role="status"><LoaderCircle className="spin" size={18} /><div><strong>Requesting the exact Devnet quote…</strong><p>The amount and treasury come from the authenticated backend.</p></div></div>}
              {(purchaseState === "error" || purchaseState === "configuration") && <div className={`checkout-notice is-error ${purchaseState === "configuration" ? "is-configuration" : ""}`} role="alert"><ShieldCheck size={18} /><div><strong>{purchaseState === "configuration" ? "Devnet purchase unavailable" : "Quote or verification failed"}</strong><p>{purchaseMessage}</p><button type="button" onClick={() => void requestQuote(selectedProduct)}>Try quote again</button></div></div>}
              {quote && ["ready", "verifying", "verified"].includes(purchaseState) && (
                <>
                  <div className="quote-grid">
                    <div><span>Network</span><strong>Solana Devnet</strong></div>
                    <div><span>Exact amount</span><strong>{formatSol(quote.lamports)}</strong><small>{quote.lamports.toLocaleString()} lamports</small></div>
                    <div className="quote-wide"><span>Treasury</span><code>{quote.treasury}</code><button type="button" aria-label="Copy treasury address" onClick={() => void copyQuoteValue(quote.treasury)}><Copy size={13} /> Copy</button></div>
                    <div className="quote-wide"><span>Linked payer wallet</span>{wallet ? <code title={wallet}>{shortAddress(wallet)}</code> : <strong className="missing-wallet">Devnet wallet required</strong>}</div>
                  </div>
                  {purchaseState !== "verified" && <SolanaWalletPay key={`${quote.productId}:${quote.treasury}:${quote.lamports}`} quote={quote} linkedWallet={wallet} onWalletLinked={(publicKey) => { if (profile) onProfileChange({ ...profile, solanaWallet: publicKey }); }} onVerified={acceptVerifiedUnlock} onBusyChange={(busy) => setPurchaseState(busy ? "verifying" : "ready")} />}
                  {!wallet ? <div className="checkout-notice is-warning"><WalletCards size={18} /><div><strong>Connect a wallet above.</strong><p>HitMeUp links only its public address to your private profile. It never requests a seed phrase or private key.</p></div></div> : (
                    <form className="signature-form" onSubmit={verifySignature}>
                      <div className="manual-fallback"><span>Manual fallback</span><small>Already transferred from the linked wallet? Paste its signature instead.</small></div>
                      <label htmlFor="devnet-signature"><span>Confirmed transaction signature</span><textarea id="devnet-signature" aria-describedby="signature-help" rows={3} value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Paste the real signature produced by your linked wallet" autoComplete="off" spellCheck={false} disabled={purchaseState === "verifying" || purchaseState === "verified"} /></label>
                      <p id="signature-help">Transfer the exact quoted amount to the treasury from the linked wallet, then paste that transaction&apos;s signature. The server checks the payer, amount, destination and confirmed Devnet slot.</p>
                      <button className="primary-action" type="submit" disabled={!signature.trim() || purchaseState === "verifying" || purchaseState === "verified"}>{purchaseState === "verifying" ? <><LoaderCircle className="spin" size={15} /> Verifying on Devnet…</> : purchaseState === "verified" ? <><Check size={15} /> Verified</> : "Verify signature"}</button>
                    </form>
                  )}
                </>
              )}
              {purchaseState === "verified" && unlockResult && <div className="checkout-success" role="status"><BadgeCheck size={19} /><div><strong>{purchaseMessage}</strong><span>Confirmed slot {unlockResult.slot.toLocaleString()} · public Devnet receipt only.</span>{verifiedSignature && <a href={devnetExplorerUrl(verifiedSignature)} target="_blank" rel="noreferrer">View in Solana Explorer ↗</a>}</div></div>}
            </>
          )}
        </section>
      )}
      </details>
    </section>
  );
}
