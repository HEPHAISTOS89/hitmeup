"use client";

import { BadgeCheck, Check, Copy, Download, LoaderCircle, RotateCcw, ShieldCheck, Shuffle, Sparkles, Star, WalletCards, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import {
  ApiError,
  getAvatarMarketplace,
  getCosmeticQuote,
  getRewards,
  setAvatarMarketplaceItem,
  unlockCosmetic,
  unlockWithRewardPoints,
} from "@/lib/client-api";
import { AVATAR_MARKETPLACE_CATALOG } from "@/lib/avatar-marketplace-catalog";
import { devnetExplorerUrl } from "@/lib/solana-wallet";
import type { AvatarMarketplaceProjection, CosmeticQuote, CosmeticUnlockResult, ProfileProjection, RewardSummary } from "@/lib/types";
import lauraManifestJson from "../../public/avatar/laura/manifest.json";
import { LauraCharacter } from "./laura-character";
import { SolanaWalletPay } from "./solana-wallet-pay";

type LauraTab = "outfits" | "expressions" | "accessories" | "backgrounds";
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

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

function randomUnit() {
  const value = new Uint32Array(1);
  window.crypto.getRandomValues(value);
  return value[0] / 0x1_0000_0000;
}

function drawLauraBackground(context: CanvasRenderingContext2D, background: LauraBackgroundAsset | undefined) {
  context.fillStyle = background?.color ?? "#ed4d25";
  context.fillRect(0, 0, 520, 660);
  const pattern = background?.pattern;
  if (pattern === "check") {
    context.fillStyle = "#24251e";
    for (let y = 0; y < 12; y += 1) for (let x = 0; x < 10; x += 1) if ((x + y) % 2 === 0) context.fillRect(x * 58, y * 58, 58, 58);
  } else if (pattern === "burst") {
    context.fillStyle = "#e7d9b7";
    for (let index = 0; index < 24; index += 2) {
      const angle = index * Math.PI / 12;
      context.beginPath(); context.moveTo(260, 300); context.lineTo(260 + 1000 * Math.cos(angle), 300 + 1000 * Math.sin(angle)); context.lineTo(260 + 1000 * Math.cos(angle + Math.PI / 12), 300 + 1000 * Math.sin(angle + Math.PI / 12)); context.closePath(); context.fill();
    }
  } else if (pattern === "dots") {
    context.fillStyle = "#20211c";
    for (let y = 0; y < 660; y += 20) for (let x = 0; x < 520; x += 20) { context.beginPath(); context.arc(x, y, 2 + 3 * (1 - x / 520), 0, Math.PI * 2); context.fill(); }
    context.save(); context.translate(260, 330); context.rotate(-.12); context.fillStyle = "#ed4d25"; context.fillRect(-140, -275, 280, 550); context.restore();
  } else if (pattern === "wave") {
    context.strokeStyle = "#e2d8b5"; context.lineWidth = 13;
    for (let index = -5; index < 19; index += 1) { context.beginPath(); for (let y = 0; y <= 680; y += 5) { const x = index * 40 + Math.sin(y / 85) * 42; if (y === 0) context.moveTo(x, y); else context.lineTo(x, y); } context.stroke(); }
  } else if (pattern === "tape") {
    context.save(); context.translate(280, 330); context.rotate(-.28); context.fillStyle = "#272721"; context.fillRect(-235, -310, 470, 620); context.fillStyle = "#ee4d29"; context.fillRect(-230, -230, 460, 115); context.fillStyle = "#ebdfb7"; context.fillRect(-230, 170, 460, 75); context.restore();
  } else if (pattern === "grid") {
    context.strokeStyle = "#698583"; context.lineWidth = 1;
    for (let x = 0; x <= 520; x += 40) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 660); context.stroke(); }
    for (let y = 0; y <= 660; y += 40) { context.beginPath(); context.moveTo(0, y); context.lineTo(520, y); context.stroke(); }
    context.strokeStyle = "#ed4d25"; context.lineWidth = 24; context.beginPath(); context.arc(260, 270, 182, 0, Math.PI * 2); context.stroke();
  }
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

export function LauraAvatarMarketplace({
  profile,
  previewMode,
  onProfileChange,
}: {
  profile: ProfileProjection | null;
  previewMode: boolean;
  onProfileChange: (profile: ProfileProjection | null) => void;
}) {
  const [lauraTab, setLauraTab] = useState<LauraTab>("outfits");
  const [downloadBusy, setDownloadBusy] = useState(false);
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
  const rewardItems = avatarMarketplace.filter((item) => item.unlockMethod === "reward_points");
  const visibleRewardItems = rewardItems.filter(collectionMatches);
  const hasLocalAvatarPreview = previewMode || Object.keys(avatarPreviewByGroup).length > 0;
  const hasPlaceholderAssets = avatarMarketplace.some((item) => item.assetStatus === "placeholder");
  const balancePoints = rewards?.balance ?? 0;
  const nextLockedReward = visibleRewardItems.filter((item) => !item.owned).sort((left, right) => left.rewardPoints - right.rewardPoints)[0];
  const nextRewardProgress = nextLockedReward ? Math.min(100, (balancePoints / nextLockedReward.rewardPoints) * 100) : 100;
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

  function resetAvatarPreview() {
    setAvatarPreviewByGroup({});
    setSelectedAvatarItem(null);
    setAvatarQuote(null);
    setAvatarMarketplaceMessage("Preview reset to your backend loadout. No ownership or equipped item changed.");
  }

  function shuffleAvatarPreview() {
    const ownedApproved = avatarMarketplace.filter((item) => item.owned && item.assetStatus === "approved");
    const collections = ownedApproved.filter((item) => item.category === "collection");
    const collection = collections[Math.floor(randomUnit() * collections.length)] ?? activeCollectionItem;
    const collectionValue = collection?.value === "female" ? "female" : "male";
    const next: Record<string, string> = collection ? { collection: collection.sku } : {};
    for (const category of ["top", "bottom", "expression", "background"] as const) {
      const choices = ownedApproved.filter((item) => item.category === category && item.collections.includes(collectionValue));
      const choice = choices[Math.floor(randomUnit() * choices.length)];
      if (choice) next[choice.equipGroup] = choice.sku;
    }
    const accessoryGroups = new Set(ownedApproved.filter((item) => item.category === "accessory" && item.collections.includes(collectionValue)).map((item) => item.equipGroup));
    for (const group of accessoryGroups) {
      const choices = ownedApproved.filter((item) => item.category === "accessory" && item.equipGroup === group && item.collections.includes(collectionValue));
      if (randomUnit() > .55 && choices.length) next[group] = choices[Math.floor(randomUnit() * choices.length)].sku;
      else next[group] = "";
    }
    setAvatarPreviewByGroup(next);
    setSelectedAvatarItem(null);
    setAvatarQuote(null);
    setAvatarMarketplaceMessage("Shuffled an owned-art preview. Your backend loadout has not changed.");
  }

  async function downloadAvatar() {
    if (!activeCharacterAsset || downloadBusy) return;
    setDownloadBusy(true);
    setAvatarMarketplaceMessage("");
    try {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = 520 * scale;
      canvas.height = 660 * scale;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas export is unavailable.");
      context.scale(scale, scale);
      drawLauraBackground(context, activeBackgroundAsset);
      const characterImage = await loadCanvasImage(activeCharacterAsset.file);
      const characterHeight = 580;
      const characterWidth = characterHeight * activeCharacterAsset.pixelWidth / activeCharacterAsset.pixelHeight;
      const characterLeft = (520 - characterWidth) / 2;
      context.drawImage(characterImage, characterLeft, 48, characterWidth, characterHeight);
      for (const accessory of [...activeAccessoryAssets].sort((left, right) => left.order - right.order)) {
        const accessoryImage = await loadCanvasImage(accessory.file);
        const width = accessory.width * characterWidth;
        const height = width * accessory.pixelHeight / accessory.pixelWidth * (accessory.heightScale ?? 1);
        const centerX = 260 + (accessory.x - .5) * characterWidth;
        const centerY = 48 + accessory.y * characterHeight;
        context.drawImage(accessoryImage, centerX - width / 2, centerY - height / 2, width, height);
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The PNG could not be created.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.download = `hitmeup-${activeCollection}.png`;
      anchor.href = url;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setAvatarMarketplaceMessage("Your avatar preview was downloaded as a PNG.");
    } catch (error) {
      setAvatarMarketplaceMessage(error instanceof Error ? error.message : "The PNG could not be created.");
    } finally {
      setDownloadBusy(false);
    }
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
        {!characterAsset && !accessoryAsset && !backgroundAsset && <Sparkles size={24} />}
      </span>
      <strong>{item.label}</strong>
      <small>{busy ? "Updating…" : unlockLabel(item)}</small>
      {active && <span className="laura-option-check" aria-hidden="true"><Check size={12} /></span>}
    </button>;
  }

  return (
    <section className="profile-section laura-avatar-experience" aria-labelledby="laura-avatar-title">
      <section className="laura-avatar-marketplace" aria-label="Avatar customization">
        <div className="laura-marketplace-bar">
          <div><h2 id="laura-avatar-title">Customize</h2><p>Choose a look, then equip what you own.</p></div>
          <div className="avatar-access-legend" aria-label="Item access"><span><i className="is-included" />Included</span><span><i className="is-earned" />Earned</span><span><i className="is-devnet" />Devnet</span></div>
          <div className="reward-balance" aria-label={`${balancePoints} HitMeUp points, equal to ${rewardStars(balancePoints)} reward stars`}><Star size={16} /><span>{rewardsStatus === "loading" ? "Loading rewards…" : rewardsStatus === "error" ? "Rewards unavailable" : <><strong>{rewardStars(balancePoints)}</strong> stars <small>{balancePoints} points</small></>}</span></div>
        </div>

        {avatarMarketplaceStatus === "loading" && <div className="laura-marketplace-state" role="status"><LoaderCircle className="spin" size={18} /> Loading your server-owned avatar collection…</div>}
        {avatarMarketplaceStatus === "error" && <div className="laura-marketplace-state is-error" role="alert"><ShieldCheck size={18} /><span>{avatarMarketplaceMessage || "The avatar collection is unavailable."} Your saved avatar remains unchanged.</span></div>}

        {avatarMarketplaceStatus === "ready" && <>
          {hasPlaceholderAssets && <div className="avatar-asset-notice" role="note"><ShieldCheck size={17} /><p><strong>Preview only</strong><span>Some items are not available to equip yet.</span></p></div>}
          <div className="laura-workspace">
            <div className="laura-preview-panel">
              <div className="avatar-preview-top"><span>Preview</span><span>{hasLocalAvatarPreview ? "Not saved" : "Saved look"}</span></div>
              <div className={`laura-stage laura-background-${activeBackgroundAsset?.pattern ?? activeBackgroundAsset?.id ?? "signal"}`} style={backgroundStyle(activeBackgroundAsset)}>
                {activeCharacterAsset ? <div className="laura-character-canvas" role="img" aria-label={`${activeCollection} avatar wearing ${activeTop?.label ?? "default top"}, ${activeBottom?.label ?? "default bottom"}, ${activeExpression?.label ?? "default expression"}, with ${activeAccessoryItems.length} accessories and ${activeBackground?.label ?? "signal background"}`}>
                  <LauraCharacter key={`${activeCollection}:${topIndex}:${bottomIndex}:${activeExpressionValue}`} className="laura-character-art" collection={activeCollection} top={topIndex} bottom={bottomIndex} expression={activeExpressionValue} />
                  {activeAccessoryAssets.map((asset) => <Image key={asset.id} className="laura-accessory-art" src={asset.file} alt="" width={asset.pixelWidth} height={asset.pixelHeight} style={accessoryPlacement(asset, activeCharacterAsset)} />)}
                </div> : <div className="laura-art-missing" role="status">This look asset is unavailable.</div>}
              </div>
              <div className="avatar-preview-bottom">
                <div><span>Current look</span><strong>{activeTop?.label ?? "Original look"}</strong><small>{activeCollection === "female" ? "Female" : "Male"} · {activeBottom?.label ?? "Default bottom"} · {activeExpression?.label ?? "Default"}</small></div>
                <span className={`server-loadout-mark ${hasLocalAvatarPreview ? "is-preview" : ""}`}><ShieldCheck size={15} />{hasLocalAvatarPreview ? "Preview" : "Saved"}</span>
              </div>
              <div className="laura-preview-actions" aria-label="Avatar preview actions">
                <button type="button" onClick={resetAvatarPreview} disabled={!hasLocalAvatarPreview}><RotateCcw size={14} /> Reset preview</button>
                <button type="button" onClick={shuffleAvatarPreview}><Shuffle size={14} /> Shuffle owned</button>
                <button type="button" onClick={() => void downloadAvatar()} disabled={!activeCharacterAsset || downloadBusy}><Download size={14} /> {downloadBusy ? "Preparing…" : "Download PNG"}</button>
              </div>
              <div className="avatar-profile-sync"><span>{activeAccessoryItems.length} accessor{activeAccessoryItems.length === 1 ? "y" : "ies"}</span><span>{hasLocalAvatarPreview ? "Preview only" : "Synced with profile"}</span></div>
            </div>

            <div className="laura-editor">
              <div className="laura-character-switch" role="group" aria-label="Avatar collection">
                {collectionItems.map((item) => <button type="button" key={item.sku} aria-pressed={isAvatarItemActive(item)} className={isAvatarItemActive(item) ? "is-active" : ""} onClick={() => void chooseAvatarItem(item)} disabled={Boolean(avatarMarketplaceBusySku)}><span className="collection-symbol" aria-hidden="true">{item.value === "female" ? "♀" : "♂"}</span><span><strong>{item.value === "female" ? "Female" : "Male"}</strong></span><Check className="collection-check" size={16} aria-hidden="true" /></button>)}
              </div>
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
                <p className="laura-stack-note">You can combine accessories from different groups.</p>
              </div>}
              {lauraTab === "backgrounds" && <div className="laura-tab-panel" id="laura-avatar-panel-backgrounds" role="tabpanel" aria-labelledby="laura-avatar-tab-backgrounds">
                <div className="laura-option-heading"><strong>Solid colors</strong><span>6 styles</span></div><div className="laura-option-grid background-grid">{backgroundItems.filter((item) => !LAURA_MANIFEST.backgrounds.find((asset) => asset.id === item.value)?.pattern).map(lauraOptionTile)}</div>
                <div className="laura-option-heading"><strong>Graphic backgrounds</strong><span>6 styles</span></div><div className="laura-option-grid background-grid">{backgroundItems.filter((item) => Boolean(LAURA_MANIFEST.backgrounds.find((asset) => asset.id === item.value)?.pattern)).map(lauraOptionTile)}</div>
              </div>}
              <div className="avatar-editor-foot"><span>{avatarMarketplaceBusySku ? "Saving…" : hasLocalAvatarPreview ? "Preview only" : "Changes save to your profile"}</span></div>
            </div>
          </div>

          {visibleRewardItems.length > 0 && <section className="laura-reward-shelf" aria-labelledby="laura-reward-heading">
            <div className="laura-option-heading"><div><h3 id="laura-reward-heading" style={{ margin: 0 }}><strong>Rewards</strong></h3></div><span>{rewardStars(balancePoints)} stars available</span></div>
            <p>Complete a service and both leave a review to earn 5 stars. Limit: 3 rewarded services per day.</p>
            <div className="reward-ledger-summary">
              <div><span>Available</span><strong>{rewardStars(balancePoints)} stars</strong><small>{balancePoints} points</small></div>
              <div><span>Earned all-time</span><strong>{rewardStars(rewards?.lifetimeEarned ?? 0)} stars</strong><small>{rewards?.lifetimeEarned ?? 0} points</small></div>
              <div><span>Spent all-time</span><strong>{rewardStars(rewards?.lifetimeSpent ?? 0)} stars</strong><small>{rewards?.lifetimeSpent ?? 0} points</small></div>
            </div>
            {nextLockedReward && <div className="next-reward-progress"><div><span>Next collectible</span><strong>{nextLockedReward.label}</strong><small>{rewardStars(balancePoints)} / {rewardStars(nextLockedReward.rewardPoints)} stars</small></div><div role="progressbar" aria-label={`Progress toward ${nextLockedReward.label}`} aria-valuemin={0} aria-valuemax={nextLockedReward.rewardPoints} aria-valuenow={Math.min(balancePoints, nextLockedReward.rewardPoints)}><i style={{ width: `${nextRewardProgress}%` }} /></div></div>}
            <div className="laura-option-grid reward-grid">{visibleRewardItems.map(lauraOptionTile)}</div>
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
