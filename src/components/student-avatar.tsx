import type { CSSProperties } from "react";

export type SkinToneId = "porcelain" | "sand" | "golden" | "umber" | "cocoa" | "ebony";
export type HairStyleId = "crop" | "curls" | "locs" | "bob";
export type HairColorId = "ink" | "chestnut" | "auburn" | "violet";
export type FaceId = "smile" | "focused" | "wink";
export type OutfitId = "tee" | "hoodie" | "tech";
export type AccessoryId = "none" | "glasses" | "headphones";

const SKINS: Record<SkinToneId, { base: string; shadow: string; blush: string }> = {
  porcelain: { base: "#F6D2BD", shadow: "#DFAE92", blush: "#E89B92" },
  sand: { base: "#E9B68F", shadow: "#C98C68", blush: "#D98378" },
  golden: { base: "#CC8B58", shadow: "#A96842", blush: "#B9645E" },
  umber: { base: "#A96643", shadow: "#7D452F", blush: "#9F534E" },
  cocoa: { base: "#75442F", shadow: "#512D23", blush: "#834741" },
  ebony: { base: "#4A2B24", shadow: "#301A17", blush: "#63362F" },
};

const HAIR: Record<HairColorId, { base: string; shine: string }> = {
  ink: { base: "#17171B", shine: "#37343C" },
  chestnut: { base: "#4A2C25", shine: "#735045" },
  auburn: { base: "#7C3529", shine: "#B65B42" },
  violet: { base: "#51345D", shine: "#8964A0" },
};

const OUTFITS: Record<OutfitId, { base: string; trim: string }> = {
  tee: { base: "#E7011F", trim: "#FF7669" },
  hoodie: { base: "#F7F2ED", trim: "#D6CDC7" },
  tech: { base: "#1D2530", trim: "#5E9FD6" },
};

function Hair({ style, base, shine }: { style: HairStyleId; base: string; shine: string }) {
  if (style === "crop") {
    return <g><path d="M70 90c0-43 29-66 58-66 37 0 60 29 60 68-14-19-31-27-56-25-25 2-43 10-62 23Z" fill={base}/><path d="M83 61c22-27 62-32 87 1-31-15-58-12-87-1Z" fill={shine} opacity=".55"/></g>;
  }
  if (style === "bob") {
    return <g><path d="M61 94c0-49 28-74 67-74 43 0 70 30 70 80v72l-25-14-7-72c-21-21-50-24-78-5l-5 79-24 12 2-78Z" fill={base}/><path d="M77 60c23-35 71-37 101 2-34-20-68-21-101-2Z" fill={shine} opacity=".5"/></g>;
  }
  if (style === "locs") {
    return <g fill="none" stroke={base} strokeWidth="16" strokeLinecap="round"><path d="M77 82c-12 30-9 69-3 91"/><path d="M94 57c-13 39-9 91-2 124"/><path d="M115 43c-8 47-6 100-3 137"/><path d="M137 43c8 46 7 101 4 137"/><path d="M159 54c12 42 9 91 3 126"/><path d="M178 78c12 34 9 72 4 96"/></g>;
  }
  return <g><g fill={base}><circle cx="77" cy="86" r="27"/><circle cx="83" cy="58" r="28"/><circle cx="108" cy="41" r="29"/><circle cx="139" cy="39" r="30"/><circle cx="166" cy="54" r="29"/><circle cx="182" cy="82" r="27"/><circle cx="65" cy="112" r="22"/><circle cx="192" cy="112" r="22"/></g><g fill={shine} opacity=".55"><circle cx="99" cy="53" r="10"/><circle cx="151" cy="50" r="11"/><circle cx="176" cy="78" r="9"/></g></g>;
}

function Expression({ face, skinShadow }: { face: FaceId; skinShadow: string }) {
  return <g>
    <path d="M97 109c7-5 15-5 22 0M141 109c7-5 15-5 22 0" fill="none" stroke="#262126" strokeWidth="5" strokeLinecap="round"/>
    {face === "wink" ? <><path d="M98 123c6 5 13 5 19 0" fill="none" stroke="#262126" strokeWidth="5" strokeLinecap="round"/><ellipse cx="153" cy="124" rx="7" ry="9" fill="#262126"/></> : <><ellipse cx="108" cy="124" rx="7" ry={face === "focused" ? 7 : 9} fill="#262126"/><ellipse cx="152" cy="124" rx="7" ry={face === "focused" ? 7 : 9} fill="#262126"/><circle cx="110" cy="121" r="2" fill="#fff"/><circle cx="154" cy="121" r="2" fill="#fff"/></>}
    <path d="M130 126c-3 8-3 14 3 15" fill="none" stroke={skinShadow} strokeWidth="3" strokeLinecap="round"/>
    {face === "focused" ? <path d="M116 153c9 3 19 3 28 0" fill="none" stroke="#632F35" strokeWidth="4" strokeLinecap="round"/> : <g><path d="M112 151c10 15 28 16 39 0-12 5-26 5-39 0Z" fill="#842F3B"/><path d="M119 153c8 5 17 5 25 0" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"/></g>}
  </g>;
}

function Outfit({ outfit, base, trim }: { outfit: OutfitId; base: string; trim: string }) {
  if (outfit === "hoodie") {
    return <g><path d="M44 270c3-57 34-86 84-86s82 29 85 86H44Z" fill={base} stroke="#2A272C" strokeWidth="5"/><path d="M89 192c6 24 72 24 78 0l16 12c-8 43-102 43-110 0l16-12Z" fill={trim}/><path d="M111 215v39M147 215v39" stroke="#817A76" strokeWidth="4" strokeLinecap="round"/><circle cx="111" cy="255" r="5" fill="#E7011F"/><circle cx="147" cy="255" r="5" fill="#E7011F"/></g>;
  }
  if (outfit === "tech") {
    return <g><path d="M43 270c4-59 34-86 85-86s81 27 85 86H43Z" fill={base}/><path d="m91 190 37 38 38-38 17 11-18 69H91l-18-69 18-11Z" fill={trim}/><path d="m92 190 36 38-20 14-27-45 11-7Zm72 0-36 38 20 14 27-45-11-7Z" fill="#F7F2ED"/><path d="M128 228v42" stroke="#17171B" strokeWidth="4"/></g>;
  }
  return <g><path d="M42 270c5-59 35-86 86-86s82 27 87 86H42Z" fill={base}/><path d="M102 189c4 18 48 18 53 0" fill="none" stroke={trim} strokeWidth="13" strokeLinecap="round"/><path d="M128 224v26m-13-13h26" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".95"/></g>;
}

export function StudentAvatar({
  skin = "golden",
  hair = "curls",
  hairColor = "ink",
  face = "smile",
  outfit = "hoodie",
  accessory = "none",
  className,
  title = "Illustrated student avatar",
}: {
  skin?: SkinToneId;
  hair?: HairStyleId;
  hairColor?: HairColorId;
  face?: FaceId;
  outfit?: OutfitId;
  accessory?: AccessoryId;
  className?: string;
  title?: string;
}) {
  const skinTone = SKINS[skin];
  const hairTone = HAIR[hairColor];
  const clothing = OUTFITS[outfit];
  const css = { "--avatar-accent": clothing.trim } as CSSProperties;

  return <svg className={className} style={css} viewBox="0 0 256 280" role={title ? "img" : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true} focusable="false" xmlns="http://www.w3.org/2000/svg">
    {title && <title>{title}</title>}
    <g strokeLinejoin="round">
      <Outfit outfit={outfit} base={clothing.base} trim={clothing.trim}/>
      <path d="M108 169v28c7 10 33 10 41 0v-30" fill={skinTone.base} stroke={skinTone.shadow} strokeWidth="4"/>
      <ellipse cx="68" cy="124" rx="15" ry="20" fill={skinTone.base} stroke={skinTone.shadow} strokeWidth="4"/>
      <ellipse cx="189" cy="124" rx="15" ry="20" fill={skinTone.base} stroke={skinTone.shadow} strokeWidth="4"/>
      <path d="M70 99c0-45 24-70 59-70 38 0 59 27 59 72v31c0 38-23 62-59 62-35 0-59-25-59-62V99Z" fill={skinTone.base} stroke={skinTone.shadow} strokeWidth="4"/>
      <ellipse cx="92" cy="145" rx="12" ry="6" fill={skinTone.blush} opacity=".28"/>
      <ellipse cx="166" cy="145" rx="12" ry="6" fill={skinTone.blush} opacity=".28"/>
      <Expression face={face} skinShadow={skinTone.shadow}/>
      <Hair style={hair} base={hairTone.base} shine={hairTone.shine}/>
      {accessory === "glasses" && <g fill="none" stroke="#27242A" strokeWidth="5"><rect x="88" y="113" width="38" height="27" rx="12"/><rect x="134" y="113" width="38" height="27" rx="12"/><path d="M126 123h8M88 121l-20-5M172 121l19-5"/></g>}
      {accessory === "headphones" && <g fill="none" stroke="#17171B" strokeWidth="9"><path d="M69 119c0-42 23-71 60-71s60 29 60 71"/><path d="M67 112v35M191 112v35" strokeLinecap="round"/></g>}
      {accessory === "headphones" && <g fill="#E7011F" stroke="#17171B" strokeWidth="4"><rect x="57" y="112" width="25" height="43" rx="11"/><rect x="178" y="112" width="25" height="43" rx="11"/></g>}
    </g>
  </svg>;
}
