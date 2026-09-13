import Image from "next/image";
import type { CSSProperties } from "react";
import { resolveLauraAvatarLoadout } from "@/lib/laura-avatar-loadout";
import type { AvatarMarketplaceProjection, ProfileProjection } from "@/lib/types";
import lauraManifestJson from "../../public/avatar/laura/manifest.json";
import { LauraCharacter } from "./laura-character";

type AvatarProjectionStatus = "loading" | "ready" | "error" | "preview";
type LauraAccessoryAsset = {
  id: string;
  x: number;
  y: number;
  width: number;
  order: number;
  heightScale?: number;
  file: string;
  pixelWidth: number;
  pixelHeight: number;
};
type LauraBackgroundAsset = { id: string; color: string; pattern?: string };

const ACCESSORIES = lauraManifestJson.accessories as LauraAccessoryAsset[];
const BACKGROUNDS = lauraManifestJson.backgrounds as LauraBackgroundAsset[];
const PROFILE_CHARACTER_WIDTH = 116;
const PROFILE_CHARACTER_HEIGHT = 286;
const PROFILE_CHARACTER_TOP = -4;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ST";
}

function accessoryStyle(accessory: LauraAccessoryAsset): CSSProperties {
  return {
    left: `${50 + (accessory.x - 0.5) * PROFILE_CHARACTER_WIDTH}%`,
    top: `${PROFILE_CHARACTER_TOP + accessory.y * PROFILE_CHARACTER_HEIGHT}%`,
    width: `${accessory.width * PROFILE_CHARACTER_WIDTH}%`,
    zIndex: 3 + accessory.order,
    "--accessory-height-scale": accessory.heightScale ?? 1,
  } as CSSProperties;
}

export function ProfileAvatarPicture({
  profile,
  marketplaceItems,
  marketplaceStatus = marketplaceItems ? "ready" : "preview",
}: {
  profile: ProfileProjection | null;
  marketplaceItems?: readonly AvatarMarketplaceProjection[];
  marketplaceStatus?: AvatarProjectionStatus;
}) {
  if (!profile) return <span className="profile-avatar-fallback" aria-hidden="true">ST</span>;
  if (marketplaceStatus === "loading" || marketplaceStatus === "error") {
    return <span
      className="profile-avatar-fallback"
      role="img"
      aria-label={marketplaceStatus === "loading" ? `${profile.displayName}'s avatar is loading` : `${profile.displayName}'s avatar is unavailable`}
      data-avatar-status={marketplaceStatus}
    >{initials(profile.displayName)}</span>;
  }
  const avatar = profile.avatarConfig;
  const loadout = resolveLauraAvatarLoadout(marketplaceItems);
  const background = BACKGROUNDS.find((item) => item.id === loadout.background);
  const accessories = loadout.accessories
    .map((id) => ACCESSORIES.find((item) => item.id === id))
    .filter((item): item is LauraAccessoryAsset => Boolean(item));
  return <span
    className={`laura-profile-avatar laura-background-${background?.pattern ?? background?.id ?? "signal"}`}
    role="img"
    aria-label={`${profile.displayName}'s avatar`}
    data-collection={loadout.collection}
    data-top={loadout.top}
    data-bottom={loadout.bottom}
    data-expression={loadout.expression}
    data-accessories={loadout.accessories.join(",")}
    data-background={loadout.background}
    style={{ "--laura-background": background?.color ?? "#ed4d25" } as CSSProperties}
  >
    <LauraCharacter className="student-avatar" collection={loadout.collection} top={loadout.top} bottom={loadout.bottom} expression={loadout.expression} skin={avatar.skin} hair={avatar.hair} hairColor={avatar.hairColor} />
    {accessories.map((accessory) => <Image
      key={accessory.id}
      className="laura-profile-accessory"
      src={accessory.file}
      alt=""
      width={accessory.pixelWidth}
      height={accessory.pixelHeight}
      style={accessoryStyle(accessory)}
    />)}
  </span>;
}

export function ProfileAvatarLink({ profile, previewMode, marketplaceItems, marketplaceStatus }: { profile: ProfileProjection | null; previewMode: boolean; marketplaceItems?: readonly AvatarMarketplaceProjection[]; marketplaceStatus?: AvatarProjectionStatus }) {
  return <a className="profile-avatar-link" href={previewMode ? "/avatar?preview=1" : "/avatar"} aria-label="Customize your avatar" title="Customize your avatar">
    <ProfileAvatarPicture profile={profile} marketplaceItems={marketplaceItems} marketplaceStatus={marketplaceStatus} />
    <span aria-hidden="true">✎</span>
  </a>;
}
