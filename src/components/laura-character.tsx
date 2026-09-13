import Image from "next/image";
import type { HairColorId, HairStyleId, SkinToneId } from "@/lib/types";
import lauraManifestJson from "../../public/avatar/laura/manifest.json";

type Collection = "male" | "female";
type Expression = "default" | "happy" | "playful";
type CharacterAsset = { collection: Collection; top: number; bottom: number; face: string; file: string; pixelWidth: number; pixelHeight: number };
const CHARACTERS = lauraManifestJson.characters as CharacterAsset[];

export function LauraCharacter({
  collection,
  top,
  bottom,
  expression,
  className,
}: {
  collection: Collection;
  top: number;
  bottom: number;
  expression: Expression;
  /** Legacy profile fields are accepted but intentionally do not recolor Laura's raster art. */
  skin?: SkinToneId;
  hair?: HairStyleId;
  hairColor?: HairColorId;
  className?: string;
}) {
  const asset = CHARACTERS.find((item) => item.collection === collection && item.top === top && item.bottom === bottom && item.face === expression);
  if (!asset) return null;
  return <Image className={className} src={asset.file} alt="" width={asset.pixelWidth} height={asset.pixelHeight} aria-hidden="true" />;
}
