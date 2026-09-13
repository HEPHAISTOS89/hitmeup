import { useId } from "react";
import type { HairColorId, HairStyleId, SkinToneId } from "./student-avatar";

type Collection = "male" | "female";
type Expression = "default" | "happy" | "playful";

const SKINS: Record<SkinToneId, { base: string; shadow: string }> = {
  porcelain: { base: "#F6D2BD", shadow: "#DFAE92" },
  sand: { base: "#E9B68F", shadow: "#C98C68" },
  golden: { base: "#CC8B58", shadow: "#A96842" },
  umber: { base: "#A96643", shadow: "#7D452F" },
  cocoa: { base: "#75442F", shadow: "#512D23" },
  ebony: { base: "#4A2B24", shadow: "#301A17" },
};

const HAIR_COLORS: Record<HairColorId, { base: string; shine: string }> = {
  ink: { base: "#17171B", shine: "#37343C" },
  chestnut: { base: "#4A2C25", shine: "#735045" },
  auburn: { base: "#7C3529", shine: "#B65B42" },
  violet: { base: "#51345D", shine: "#8964A0" },
};

function Bottom({ collection, index, skin }: { collection: Collection; index: number; skin: string }) {
  if (collection === "female" && index === 1) {
    return <><path d="M197 379h126l33 91H164z" fill="#6e3343" stroke="#171819" strokeWidth="10"/><path d="M183 409h154M201 379l-9 91M238 379l-3 91M278 379l5 91M317 379l15 91" stroke="#e8d7bd" strokeWidth="6" opacity=".75"/><path d="M190 466l13 99h48l9-95 9 95h48l13-99" fill={skin} stroke="#171819" strokeWidth="10" strokeLinejoin="round"/></>;
  }
  if (collection === "male" && index === 2) {
    return <><path d="M184 372h152l-8 116h-57l-11-78-11 78h-57z" fill="#c7b375" stroke="#171819" strokeWidth="10" strokeLinejoin="round"/><path d="M199 484l6 81h43l12-78 12 78h43l6-81" fill={skin} stroke="#171819" strokeWidth="10"/></>;
  }
  const color = index === 0 ? "#263139" : "#526f83";
  const seam = index === 0 ? "#65747a" : "#9bb0bd";
  return <><path d="M184 367h152l-14 198h-58l-4-126-4 126h-58z" fill={color} stroke="#171819" strokeWidth="10" strokeLinejoin="round"/><path d="M260 379v67M199 421l43 7M321 421l-43 7" fill="none" stroke={seam} strokeWidth="6"/></>;
}

function Top({ collection, index }: { collection: Collection; index: number }) {
  if (index === 0) {
    return <><path d="M170 269q21-32 64-38h52q43 6 64 38l-12 122H182z" fill="#c51f35" stroke="#171819" strokeWidth="10" strokeLinejoin="round"/><path d="M233 232l27 47 27-47 20 159h-94z" fill="#eee2ca" stroke="#171819" strokeWidth="8" strokeLinejoin="round"/><path d="M181 283l-31 112 43 14 24-104M339 283l31 112-43 14-24-104" fill="#c51f35" stroke="#171819" strokeWidth="10" strokeLinecap="round"/><path d="M201 271l37 42 22-34 23 34 36-42" fill="none" stroke="#171819" strokeWidth="7"/></>;
  }
  if (index === 1 && collection === "male") {
    return <><path d="M171 270q20-33 64-39h50q44 6 64 39l-9 123H180z" fill="#4f7d79" stroke="#171819" strokeWidth="10"/><path d="M260 238v155M192 302h45v36h-45M283 302h45v36h-45" fill="none" stroke="#171819" strokeWidth="7"/><circle cx="260" cy="279" r="4" fill="#eee2ca"/><circle cx="260" cy="313" r="4" fill="#eee2ca"/><circle cx="260" cy="347" r="4" fill="#eee2ca"/><path d="M181 287l-30 108 43 14 23-102M339 287l30 108-43 14-23-102" fill="#4f7d79" stroke="#171819" strokeWidth="10"/></>;
  }
  if (index === 2 && collection === "female") {
    return <><path d="M170 270q22-35 66-40h48q44 5 66 40l-10 123H180z" fill="#3f8584" stroke="#171819" strokeWidth="10"/><path d="M215 238q45 40 90 0l12 46-57 24-58-24z" fill="#d9c8aa" stroke="#171819" strokeWidth="8"/><path d="M182 286l-31 109 44 14 22-103M338 286l31 109-44 14-22-103" fill="#3f8584" stroke="#171819" strokeWidth="10"/><path d="M247 347h26" stroke="#e9d8b7" strokeWidth="8" strokeLinecap="round"/></>;
  }
  const fill = collection === "male" ? "#ece0c5" : "#202b36";
  const star = collection === "male" ? "#ed4d25" : "#f0d991";
  return <><path d="M171 270q22-35 65-40h48q43 5 65 40l-9 123H180z" fill={fill} stroke="#171819" strokeWidth="10"/><path d="M182 286l-31 109 44 14 22-103M338 286l31 109-44 14-22-103" fill={fill} stroke="#171819" strokeWidth="10"/><path d="M260 276l11 24 26 3-19 18 6 26-24-13-24 13 6-26-19-18 26-3z" fill={star} stroke="#171819" strokeWidth="5" strokeLinejoin="round"/></>;
}

function Hair({ style, base, shine }: { style: HairStyleId; base: string; shine: string }) {
  if (style === "crop") {
    return <><path d="M188 142q3-83 75-90 72 7 81 79-30-31-63-30-49 1-93 41z" fill={base} stroke="#171819" strokeWidth="9" strokeLinejoin="round"/><path d="M208 92l18-23 17 20 19-29 20 27 26-19 8 32" fill="none" stroke={shine} strokeWidth="12" strokeLinejoin="round"/></>;
  }
  if (style === "bob") {
    return <><path d="M177 155q-2-91 85-103 94 7 88 111l-13 83-42-16 20-94q-41-40-105-4l18 104-43 15z" fill={base} stroke="#171819" strokeWidth="9" strokeLinejoin="round"/><path d="M204 103q38-42 105-8" fill="none" stroke={shine} strokeWidth="13" strokeLinecap="round"/></>;
  }
  if (style === "locs") {
    return <g fill="none" strokeLinecap="round"><g stroke={base} strokeWidth="28"><path d="M197 112q-26 53-16 125"/><path d="M220 79q-24 73-15 173"/><path d="M246 62q-15 88-9 187"/><path d="M274 63q16 86 9 187"/><path d="M301 80q25 73 14 166"/><path d="M325 108q27 59 15 127"/></g><g stroke={shine} strokeWidth="7" opacity=".7"><path d="M197 112q-26 53-16 125"/><path d="M246 62q-15 88-9 187"/><path d="M301 80q25 73 14 166"/></g></g>;
  }
  return <><g fill={base} stroke="#171819" strokeWidth="5"><circle cx="195" cy="118" r="39"/><circle cx="204" cy="82" r="39"/><circle cx="234" cy="58" r="40"/><circle cx="273" cy="57" r="41"/><circle cx="309" cy="78" r="40"/><circle cx="329" cy="115" r="38"/><circle cx="181" cy="153" r="32"/><circle cx="341" cy="151" r="32"/></g><g fill={shine} opacity=".62"><circle cx="222" cy="73" r="13"/><circle cx="289" cy="70" r="14"/><circle cx="321" cy="108" r="12"/></g></>;
}

function Face({ expression }: { expression: Expression }) {
  if (expression === "happy") {
    return <><path d="M218 165q18 14 36 0" fill="none" stroke="#171819" strokeWidth="8" strokeLinecap="round"/><path d="M272 165q18 14 36 0" fill="none" stroke="#171819" strokeWidth="8" strokeLinecap="round"/><path d="M228 202q32 34 64 0" fill="#fff" stroke="#171819" strokeWidth="7" strokeLinejoin="round"/></>;
  }
  if (expression === "playful") {
    return <><circle cx="236" cy="169" r="8" fill="#171819"/><path d="M277 169q15-12 29 0" fill="none" stroke="#171819" strokeWidth="8" strokeLinecap="round"/><path d="M239 207q22 16 48 0" fill="none" stroke="#171819" strokeWidth="7" strokeLinecap="round"/><path d="M274 211q10 18 20 0" fill="#ed4d25" stroke="#171819" strokeWidth="5"/></>;
  }
  return <><circle cx="236" cy="169" r="8" fill="#171819"/><circle cx="290" cy="169" r="8" fill="#171819"/><path d="M239 205q22 18 48 0" fill="none" stroke="#171819" strokeWidth="7" strokeLinecap="round"/></>;
}

export function LauraCharacter({
  collection,
  top,
  bottom,
  expression,
  skin,
  hair,
  hairColor,
  className,
}: {
  collection: Collection;
  top: number;
  bottom: number;
  expression: Expression;
  skin: SkinToneId;
  hair: HairStyleId;
  hairColor: HairColorId;
  className?: string;
}) {
  const gradientId = `skin-${useId().replaceAll(":", "")}`;
  const shadowId = `shadow-${useId().replaceAll(":", "")}`;
  const skinTone = SKINS[skin];
  const hairTone = HAIR_COLORS[hairColor];

  return <svg className={className} viewBox="0 0 520 580" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop stopColor={skinTone.base}/><stop offset="1" stopColor={skinTone.shadow}/></linearGradient>
      <filter id={shadowId} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="9" stdDeviation="0" floodColor="#171819" floodOpacity=".16"/></filter>
    </defs>
    <g filter={`url(#${shadowId})`}>
      <Bottom collection={collection} index={bottom} skin={skinTone.base}/>
      <path d="M238 213h44v46h-44z" fill={`url(#${gradientId})`} stroke="#171819" strokeWidth="9"/>
      <Top collection={collection} index={top}/>
      <circle cx="190" cy="169" r="22" fill={`url(#${gradientId})`} stroke="#171819" strokeWidth="9"/>
      <circle cx="330" cy="169" r="22" fill={`url(#${gradientId})`} stroke="#171819" strokeWidth="9"/>
      <circle cx="260" cy="158" r="79" fill={`url(#${gradientId})`} stroke="#171819" strokeWidth="10"/>
      <Hair style={hair} base={hairTone.base} shine={hairTone.shine}/>
      <path d="M253 178l-5 19 17 1" fill="none" stroke={skinTone.shadow} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
      <Face expression={expression}/>
      <path d="M206 234q54 30 108 0" fill="none" stroke="#171819" strokeWidth="8" strokeLinecap="round"/>
    </g>
    <g transform="translate(411 509) rotate(-7)"><rect width="82" height="34" rx="17" fill="#eee2ca" stroke="#171819" strokeWidth="5"/><text x="41" y="23" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="15" fontWeight="900" fill="#171819">HMU</text></g>
  </svg>;
}
