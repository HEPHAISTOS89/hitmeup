"use client";

import { BadgeCheck, Check, Copy, LoaderCircle, LockKeyhole, Palette, ShieldCheck, Sparkles, WalletCards, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ApiError, equipCosmetic, getCosmeticQuote, getCosmetics, unlockCosmetic, updateProfile } from "@/lib/client-api";
import { devnetExplorerUrl } from "@/lib/solana-wallet";
import type { AvatarConfig, CosmeticProjection, CosmeticQuote, CosmeticUnlockResult, ProfileProjection } from "@/lib/types";
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
type ProductVisual = { name: string; kind: "frame" | "patch" | "motion"; value: FrameId | PatchId | MotionId; asset: string };
type PurchaseState = "idle" | "quoting" | "ready" | "verifying" | "verified" | "error" | "configuration";

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

function formatSol(lamports: number) {
  return `${(lamports / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
}

function shortAddress(address: string) {
  if (address.length < 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
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
  if (!sku) return <span className="layer-access is-free">Free</span>;
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
  const persistedAvatarKey = profile ? Object.values(profile.avatarConfig).join(":") : "";
  const hydratedAvatarKey = useRef(persistedAvatarKey);

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

  const catalogBySku = useMemo(() => new Map(catalog.map((item) => [item.sku, item])), [catalog]);
  const ownedProducts = catalog.filter((item) => item.owned);
  const premiumProducts = catalog.filter((item) => !item.owned);
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
  const compositionStatus = lockedSkus.length ? "Preview contains a locked Devnet layer" : "Composition ready to use";
  const wallet = profile?.solanaWallet ?? null;
  const avatarConfig: AvatarConfig = { skin, face, hair, hairColor, outfit, accessory };
  const savedAvatar = profile?.avatarConfig;
  const avatarDirty = Boolean(savedAvatar) && Object.entries(avatarConfig).some(([key, value]) => savedAvatar?.[key as keyof AvatarConfig] !== value);

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

  function previewProduct(item: CosmeticProjection) {
    applyProduct(item.sku);
    setSelectedProduct(item);
    setPurchaseState("idle");
    setQuote(null);
    setSignature("");
    setUnlockResult(null);
    setVerifiedSignature(null);
    setPurchaseMessage("");
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
      const result = await unlockCosmetic(selectedProduct.sku, cleanSignature);
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

  return (
    <section className="profile-section avatar-studio" aria-labelledby="avatar-studio-title">
      <div className="section-heading studio-heading">
        <div><span className="section-kicker">AVATAR STUDIO</span><h2 id="avatar-studio-title">Make it yours.</h2></div>
        <span className="studio-mark" aria-hidden="true"><Palette size={19} /></span>
      </div>
      <p className="section-copy">Create an illustrated student avatar from original HitMeUp vectors, then add free, owned or Devnet cosmetics.</p>

      <div className="studio-layout studio-layout-expanded">
        <div className="avatar-stage">
          <div className="avatar-stage-grid" aria-hidden="true" />
          <div className={`avatar-preview avatar-motion-${motion}`} role="img" aria-label={`Illustrated student avatar with ${hair} hair, ${outfit}, ${accessory}, ${frameOption.label} frame, ${patchOption.label}, and ${motionOption.label} motion`}>
            <StudentAvatar className="avatar-figure-layer" skin={skin} hair={hair} hairColor={hairColor} face={face} outfit={outfit} accessory={accessory} title="" />
            <Image className="avatar-frame-layer" src={frameOption.asset} alt="" fill sizes="(max-width: 700px) 172px, 216px" priority />
            {patchOption.asset && <Image className="avatar-patch-layer" src={patchOption.asset} alt="" width={58} height={58} />}
            {motionOption.asset && <span className="avatar-motion-layer" aria-hidden="true" style={{ "--motion-mask": `url(${motionOption.asset})` } as CSSProperties} />}
          </div>
          <div className={`composition-status ${lockedSkus.length ? "is-locked" : "is-ready"}`}><span />{compositionStatus}</div>
          <button className="save-avatar-button" type="button" disabled={previewMode || !profile || !avatarDirty || avatarSaveState === "saving"} onClick={() => void saveAvatar()}>{avatarSaveState === "saving" ? <><LoaderCircle className="spin" size={14} /> Saving…</> : previewMode ? "Save in live app" : avatarSaveState === "saved" ? <><Check size={14} /> Saved</> : "Save avatar"}</button>
          {avatarSaveState === "saved" && <p className="avatar-save-status" role="status">Avatar saved to your profile.</p>}
          {avatarSaveState === "error" && <p className="avatar-save-status is-error" role="alert">The avatar could not be saved. Your previous profile stays unchanged.</p>}
        </div>

        <div className="studio-controls-stack">
          <div className="studio-tabs" role="tablist" aria-label="Avatar customization">
            {([["character", "Character"], ["style", "Style"], ["effects", "Effects"]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={studioTab === id} className={studioTab === id ? "selected" : ""} onClick={() => setStudioTab(id)}>{label}</button>)}
          </div>

          {studioTab === "character" && <div className="studio-tab-panel" role="tabpanel">
            <fieldset className="studio-control-group skin-control">
              <legend><span>Skin tone</span><em>Free</em></legend>
              <div>{SKIN_TONES.map((item) => <button className={skin === item.id ? "selected" : ""} aria-pressed={skin === item.id} type="button" key={item.id} aria-label={`${item.label} skin tone, free`} onClick={() => updateAvatarField(skin, item.id, setSkin)}><i style={{ backgroundColor: item.color }} /><span>{item.label}</span></button>)}</div>
            </fieldset>
            <fieldset className="studio-control-group avatar-choice-control">
              <legend><span>Face</span><em>Free</em></legend>
              <div>{FACES.map((item) => <button className={face === item.id ? "selected" : ""} aria-pressed={face === item.id} type="button" key={item.id} onClick={() => updateAvatarField(face, item.id, setFace)}><StudentAvatar skin={skin} hair={hair} hairColor={hairColor} face={item.id} outfit={outfit} accessory="none" title="" /><span>{item.label}</span></button>)}</div>
            </fieldset>
          </div>}

          {studioTab === "style" && <div className="studio-tab-panel" role="tabpanel">
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

          {studioTab === "effects" && <div className="studio-tab-panel" role="tabpanel">
            <fieldset className="studio-control-group layer-choice-control">
              <legend><span>Frame</span><em>Free + Devnet</em></legend>
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
          <div className="zone-heading"><div><span className="section-kicker">PREMIUM · DEVNET</span><h3 id="devnet-catalog-title">Collectible layers</h3></div><span className="network-pill">Devnet only</span></div>
          <p className="zone-intro">Cosmetics decorate profiles only. Student service payments remain off-platform and between students.</p>
          <div className="premium-grid">{premiumProducts.map((item) => {
            const visual = PRODUCT_VISUALS[item.sku];
            return <article className="premium-item" key={item.sku}>
              <div className="premium-asset">{visual ? <Image src={visual.asset} alt="" fill sizes="82px" /> : <Sparkles size={28} />}</div>
              <div><span>{item.label}</span><strong>{visual?.name ?? item.label}</strong><small>{formatSol(item.lamports)} · {item.lamports.toLocaleString()} lamports</small></div>
              <div className="premium-actions"><button className="text-button" type="button" onClick={() => previewProduct(item)}>Preview</button><button className="unlock-button" type="button" disabled={previewMode || purchaseState === "quoting" || purchaseState === "verifying"} onClick={() => void requestQuote(item)}>{previewMode ? "Live app only" : "Get quote"}</button></div>
            </article>;
          })}</div>
          {catalogStatus === "ready" && !premiumProducts.length && <div className="catalog-state">Everything in the current Devnet catalog is owned.</div>}
        </section>
      </div>

      {selectedProduct && !selectedProduct.owned && (
        <section className="devnet-checkout" aria-labelledby="devnet-checkout-title">
          <div className="checkout-heading">
            <div><span className="section-kicker">REAL DEVNET VERIFICATION</span><h3 id="devnet-checkout-title">Unlock {PRODUCT_VISUALS[selectedProduct.sku]?.name ?? selectedProduct.label}</h3></div>
            <button className="icon-button" type="button" aria-label="Close Devnet unlock" onClick={() => setSelectedProduct(null)}><X size={17} /></button>
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
    </section>
  );
}
