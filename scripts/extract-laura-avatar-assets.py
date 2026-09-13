#!/usr/bin/env python3
"""Build HitMeUp's production-safe avatar SVG pack.

The filename is kept for compatibility with the prototype workflow, but this
generator does not read Laura's raster atlases or any third-party image. Every
output is deterministic SVG authored from local geometry and color tokens.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / "public/avatar/laura"
CHARACTER_SIZE = (520, 580)
FACE_KEYS = ("default", "happy", "playful")
TOP_NAMES = {
    "male": ("Original jacket", "Utility overshirt", "Star tee"),
    "female": ("Red jacket", "Star tee", "Teal hoodie"),
}
BOTTOM_NAMES = {
    "male": ("Black cargos", "Baggy denim", "Street shorts"),
    "female": ("Black cargos", "Tartan skirt", "Baggy denim"),
}
COLLECTIONS = {
    "male": ("frames", "shades", "headphones", "cap", "beanie", "chain", "hoops", "bag", "cuff", "wallet"),
    "female": ("hearts", "frames", "shades", "headphones", "bow", "clips", "stars", "hoops", "choker", "chain", "bag", "beanie"),
}
ACCESSORY_LAYOUT: tuple[dict[str, Any], ...] = (
    {"id": "frames", "name": "Clear frames", "group": "eyewear", "x": .50, "y": .19, "width": .43, "order": 5},
    {"id": "shades", "name": "Shades", "group": "eyewear", "x": .50, "y": .19, "width": .43, "order": 5},
    {"id": "headphones", "name": "Headphones", "group": "headphones", "x": .50, "y": .18, "width": .62, "order": 4},
    {"id": "cap", "name": "Star cap", "group": "headwear", "x": .50, "y": .085, "width": .61, "order": 3},
    {"id": "chain", "name": "Star chain", "group": "neckwear", "x": .50, "y": .38, "width": .27, "order": 2},
    {"id": "hoops", "name": "Gold hoops", "group": "earrings", "x": .50, "y": .275, "width": .53, "order": 1},
    {"id": "bow", "name": "Red bow", "group": "hair", "x": .68, "y": .12, "width": .22, "order": 6},
    {"id": "hearts", "name": "Heart frames", "group": "eyewear", "x": .50, "y": .19, "width": .43, "order": 5},
    {"id": "stars", "name": "Star earrings", "group": "earrings", "x": .50, "y": .28, "width": .54, "order": 1},
    {"id": "beanie", "name": "Night beanie", "group": "headwear", "x": .50, "y": .085, "width": .62, "heightScale": .72, "order": 3},
    {"id": "bag", "name": "Crossbody bag", "group": "bag", "x": .57, "y": .55, "width": .58, "order": 2},
    {"id": "cuff", "name": "Studded cuff", "group": "wrist", "x": .77, "y": .64, "width": .16, "order": 6},
    {"id": "clips", "name": "Cherry clips", "group": "hair", "x": .67, "y": .125, "width": .17, "order": 6},
    {"id": "choker", "name": "Star choker", "group": "neckwear", "x": .50, "y": .355, "width": .25, "order": 2},
    {"id": "wallet", "name": "Wallet chain", "group": "wallet", "x": .68, "y": .67, "width": .24, "order": 2},
)
PAID_ACCESSORIES = {"beanie", "bag", "wallet", "stars", "choker"}
BACKGROUNDS = (
    {"id": "signal", "name": "Signal orange", "color": "#ed4d25"},
    {"id": "petrol", "name": "Petrol blue", "color": "#527b7a"},
    {"id": "gold", "name": "Golden hour", "color": "#b8934b"},
    {"id": "purple", "name": "Purple haze", "color": "#8d638e"},
    {"id": "dark", "name": "After dark", "color": "#343934"},
    {"id": "rose", "name": "Rose paper", "color": "#d8afaa"},
    {"id": "check", "name": "Checkmate", "color": "#ef4d24", "pattern": "check"},
    {"id": "burst", "name": "Noise burst", "color": "#ed4d25", "pattern": "burst", "tier": "paid"},
    {"id": "dots", "name": "Dot matrix", "color": "#ddd09e", "pattern": "dots"},
    {"id": "wave", "name": "Sound wave", "color": "#497e80", "pattern": "wave", "tier": "paid"},
    {"id": "tape", "name": "Cut & paste", "color": "#d8b0c1", "pattern": "tape"},
    {"id": "grid", "name": "Midnight grid", "color": "#202b36", "pattern": "grid", "tier": "paid"},
)


def svg_document(body: str, width: int, height: int, label: str) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{label}">
  {body.strip()}
</svg>
'''


def write_svg(path: Path, body: str, width: int, height: int, label: str) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    contents = svg_document(body, width, height, label)
    path.write_text(contents, encoding="utf-8")
    return {
        "file": "/" + path.relative_to(ROOT / "public").as_posix(),
        "pixelWidth": width,
        "pixelHeight": height,
        "sha256": hashlib.sha256(contents.encode()).hexdigest(),
    }


def face_markup(face: str) -> str:
    if face == "happy":
        return '''<path d="M218 165q18 14 36 0" fill="none" stroke="#171819" stroke-width="8" stroke-linecap="round"/><path d="M272 165q18 14 36 0" fill="none" stroke="#171819" stroke-width="8" stroke-linecap="round"/><path d="M228 202q32 34 64 0" fill="#fff" stroke="#171819" stroke-width="7" stroke-linejoin="round"/>'''
    if face == "playful":
        return '''<circle cx="236" cy="169" r="8" fill="#171819"/><path d="M277 169q15-12 29 0" fill="none" stroke="#171819" stroke-width="8" stroke-linecap="round"/><path d="M239 207q22 16 48 0" fill="none" stroke="#171819" stroke-width="7" stroke-linecap="round"/><path d="M274 211q10 18 20 0" fill="#ed4d25" stroke="#171819" stroke-width="5"/>'''
    return '''<circle cx="236" cy="169" r="8" fill="#171819"/><circle cx="290" cy="169" r="8" fill="#171819"/><path d="M239 205q22 18 48 0" fill="none" stroke="#171819" stroke-width="7" stroke-linecap="round"/>'''


def hair_markup(collection: str) -> str:
    if collection == "female":
        return '''<path d="M177 155q-2-91 85-103 94 7 88 111l-13 83-42-16 20-94q-41-40-105-4l18 104-43 15z" fill="#24211f" stroke="#171819" stroke-width="9" stroke-linejoin="round"/><path d="M204 103q38-42 105-8" fill="none" stroke="#5b3a31" stroke-width="13" stroke-linecap="round"/>'''
    return '''<path d="M189 142q3-82 75-89 72 7 81 78-29-31-63-30-49 1-93 41z" fill="#24211f" stroke="#171819" stroke-width="9" stroke-linejoin="round"/><path d="M209 91l17-22 17 19 19-28 19 26 26-18 8 31" fill="none" stroke="#5b3a31" stroke-width="12" stroke-linejoin="round"/>'''


def bottom_markup(collection: str, bottom: int) -> str:
    if collection == "female" and bottom == 1:
        return '''<path d="M197 379h126l33 91H164z" fill="#6e3343" stroke="#171819" stroke-width="10"/><path d="M183 409h154M201 379l-9 91M238 379l-3 91M278 379l5 91M317 379l15 91" stroke="#e8d7bd" stroke-width="6" opacity=".75"/><path d="M190 466l13 99h48l9-95 9 95h48l13-99" fill="#d4946c" stroke="#171819" stroke-width="10" stroke-linejoin="round"/>'''
    if bottom == 2 and collection == "male":
        return '''<path d="M184 372h152l-8 116h-57l-11-78-11 78h-57z" fill="#c7b375" stroke="#171819" stroke-width="10" stroke-linejoin="round"/><path d="M199 484l6 81h43l12-78 12 78h43l6-81" fill="#9b6245" stroke="#171819" stroke-width="10"/>'''
    color = "#263139" if bottom == 0 else "#526f83"
    seam = "#65747a" if bottom == 0 else "#9bb0bd"
    return f'''<path d="M184 367h152l-14 198h-58l-4-126-4 126h-58z" fill="{color}" stroke="#171819" stroke-width="10" stroke-linejoin="round"/><path d="M260 379v67M199 421l43 7M321 421l-43 7" fill="none" stroke="{seam}" stroke-width="6"/>'''


def top_markup(collection: str, top: int) -> str:
    if top == 0:
        return '''<path d="M170 269q21-32 64-38h52q43 6 64 38l-12 122H182z" fill="#c51f35" stroke="#171819" stroke-width="10" stroke-linejoin="round"/><path d="M233 232l27 47 27-47 20 159h-94z" fill="#eee2ca" stroke="#171819" stroke-width="8" stroke-linejoin="round"/><path d="M181 283l-31 112 43 14 24-104M339 283l31 112-43 14-24-104" fill="#c51f35" stroke="#171819" stroke-width="10" stroke-linecap="round"/><path d="M201 271l37 42 22-34 23 34 36-42" fill="none" stroke="#171819" stroke-width="7"/>'''
    if top == 1 and collection == "male":
        return '''<path d="M171 270q20-33 64-39h50q44 6 64 39l-9 123H180z" fill="#4f7d79" stroke="#171819" stroke-width="10"/><path d="M260 238v155M192 302h45v36h-45M283 302h45v36h-45" fill="none" stroke="#171819" stroke-width="7"/><circle cx="260" cy="279" r="4" fill="#eee2ca"/><circle cx="260" cy="313" r="4" fill="#eee2ca"/><circle cx="260" cy="347" r="4" fill="#eee2ca"/><path d="M181 287l-30 108 43 14 23-102M339 287l30 108-43 14-23-102" fill="#4f7d79" stroke="#171819" stroke-width="10"/>'''
    if top == 2 and collection == "female":
        return '''<path d="M170 270q22-35 66-40h48q44 5 66 40l-10 123H180z" fill="#3f8584" stroke="#171819" stroke-width="10"/><path d="M215 238q45 40 90 0l12 46-57 24-58-24z" fill="#d9c8aa" stroke="#171819" stroke-width="8"/><path d="M182 286l-31 109 44 14 22-103M338 286l31 109-44 14-22-103" fill="#3f8584" stroke="#171819" stroke-width="10"/><path d="M247 347h26" stroke="#e9d8b7" stroke-width="8" stroke-linecap="round"/>'''
    fill = "#ece0c5" if collection == "male" else "#202b36"
    star = "#ed4d25" if collection == "male" else "#f0d991"
    return f'''<path d="M171 270q22-35 65-40h48q43 5 65 40l-9 123H180z" fill="{fill}" stroke="#171819" stroke-width="10"/><path d="M182 286l-31 109 44 14 22-103M338 286l31 109-44 14-22-103" fill="{fill}" stroke="#171819" stroke-width="10"/><path d="M260 276l11 24 26 3-19 18 6 26-24-13-24 13 6-26-19-18 26-3z" fill="{star}" stroke="#171819" stroke-width="5" stroke-linejoin="round"/>'''


def character_body(collection: str, top: int, bottom: int, face: str) -> str:
    skin = "#a76547" if collection == "male" else "#d6946d"
    accent = "#75402e" if collection == "male" else "#a75f4e"
    key = f"{collection}-{top}-{bottom}-{face}"
    return f'''<defs><linearGradient id="skin-{key}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{skin}"/><stop offset="1" stop-color="{accent}"/></linearGradient><filter id="shadow-{key}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="9" stdDeviation="0" flood-color="#171819" flood-opacity=".16"/></filter></defs><g filter="url(#shadow-{key})">{bottom_markup(collection, bottom)}<path d="M238 213h44v46h-44z" fill="url(#skin-{key})" stroke="#171819" stroke-width="9"/>{top_markup(collection, top)}<circle cx="190" cy="169" r="22" fill="url(#skin-{key})" stroke="#171819" stroke-width="9"/><circle cx="330" cy="169" r="22" fill="url(#skin-{key})" stroke="#171819" stroke-width="9"/><circle cx="260" cy="158" r="79" fill="url(#skin-{key})" stroke="#171819" stroke-width="10"/>{hair_markup(collection)}<path d="M253 178l-5 19 17 1" fill="none" stroke="#75402e" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>{face_markup(face)}<path d="M206 234q54 30 108 0" fill="none" stroke="#171819" stroke-width="8" stroke-linecap="round"/></g><g transform="translate(411 509) rotate(-7)"><rect width="82" height="34" rx="17" fill="#eee2ca" stroke="#171819" stroke-width="5"/><text x="41" y="23" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" font-weight="900" fill="#171819">HMU</text></g>'''


ACCESSORY_SVGS: dict[str, tuple[int, int, str]] = {
    "frames": (250, 90, '''<g fill="none" stroke="#f3eddf" stroke-width="14"><rect x="8" y="15" width="92" height="62" rx="22"/><rect x="150" y="15" width="92" height="62" rx="22"/><path d="M100 40q25-18 50 0"/></g><g fill="none" stroke="#171819" stroke-width="5"><rect x="8" y="15" width="92" height="62" rx="22"/><rect x="150" y="15" width="92" height="62" rx="22"/><path d="M100 40q25-18 50 0"/></g>'''),
    "shades": (250, 90, '''<path d="M8 18h94l-8 54H37Q16 68 8 18zm234 0h-94l8 54h57q21-4 29-54z" fill="#22242a" stroke="#171819" stroke-width="7"/><path d="M102 36q23-16 46 0" fill="none" stroke="#171819" stroke-width="8"/><path d="M31 31l51 25M168 31l51 25" stroke="#718c94" stroke-width="6" opacity=".65"/>'''),
    "headphones": (300, 210, '''<path d="M42 132V95Q42 21 150 21t108 74v37" fill="none" stroke="#171819" stroke-width="30"/><path d="M42 132V95Q42 21 150 21t108 74v37" fill="none" stroke="#ee4d29" stroke-width="18"/><rect x="16" y="112" width="62" height="88" rx="24" fill="#202b36" stroke="#171819" stroke-width="8"/><rect x="222" y="112" width="62" height="88" rx="24" fill="#202b36" stroke="#171819" stroke-width="8"/><path d="M41 139h16M243 139h16" stroke="#eee2ca" stroke-width="8"/>'''),
    "cap": (280, 145, '''<path d="M38 92q11-78 102-78 89 0 104 72l-31 29H50z" fill="#202b36" stroke="#171819" stroke-width="9"/><path d="M140 20v79" stroke="#5c7478" stroke-width="6"/><path d="M115 48l9 19 21 2-16 14 5 21-19-11-19 11 5-21-16-14 21-2z" fill="#ed4d25"/><path d="M132 101q84-14 128 15-81 29-153 3z" fill="#ed4d25" stroke="#171819" stroke-width="8"/>'''),
    "chain": (160, 155, '''<path d="M22 14q8 108 58 123 50-15 58-123" fill="none" stroke="#f1ca62" stroke-width="10" stroke-dasharray="2 14" stroke-linecap="round"/><path d="M80 78l12 25 28 3-21 19 6 27-25-14-25 14 6-27-21-19 28-3z" fill="#f1ca62" stroke="#171819" stroke-width="6"/>'''),
    "hoops": (280, 105, '''<circle cx="38" cy="52" r="29" fill="none" stroke="#f1ca62" stroke-width="12"/><circle cx="242" cy="52" r="29" fill="none" stroke="#f1ca62" stroke-width="12"/><circle cx="38" cy="52" r="31" fill="none" stroke="#171819" stroke-width="4"/><circle cx="242" cy="52" r="31" fill="none" stroke="#171819" stroke-width="4"/>'''),
    "bow": (135, 110, '''<path d="M64 55Q23 8 8 31q-14 25 46 35-38 31-12 40 24 9 32-35 26 42 47 21 19-20-35-35 48-28 26-46-21-17-48 44z" fill="#ed4d25" stroke="#171819" stroke-width="7" stroke-linejoin="round"/><circle cx="67" cy="58" r="17" fill="#f2d4b4" stroke="#171819" stroke-width="6"/>'''),
    "hearts": (250, 95, '''<path d="M55 80C12 51 4 23 31 11q21-10 38 13 17-23 38-13c27 12 19 40-24 69zM195 80c-43-29-51-57-24-69q21-10 38 13 17-23 38-13c27 12 19 40-24 69z" fill="none" stroke="#ed4d79" stroke-width="12"/><path d="M107 37q18-14 36 0" fill="none" stroke="#171819" stroke-width="7"/>'''),
    "stars": (280, 110, '''<path d="M39 9l10 23 25 2-19 17 6 25-22-13-22 13 6-25L4 34l25-2zM241 9l10 23 25 2-19 17 6 25-22-13-22 13 6-25-19-17 25-2z" fill="#f1ca62" stroke="#171819" stroke-width="6"/><path d="M39 76v28M241 76v28" stroke="#171819" stroke-width="6"/>'''),
    "beanie": (280, 150, '''<path d="M40 104q7-95 100-95t100 95" fill="#202b36" stroke="#171819" stroke-width="9"/><path d="M58 83q82-35 164 0" fill="none" stroke="#526b70" stroke-width="10" stroke-dasharray="6 9"/><rect x="28" y="94" width="224" height="46" rx="17" fill="#202b36" stroke="#171819" stroke-width="9"/><path d="M48 115h184" stroke="#ed4d25" stroke-width="7"/><circle cx="140" cy="8" r="8" fill="#ed4d25"/>'''),
    "bag": (260, 330, '''<path d="M29 9l201 312" fill="none" stroke="#171819" stroke-width="27"/><path d="M29 9l201 312" fill="none" stroke="#b57844" stroke-width="15"/><path d="M85 142h145q20 0 20 20v125q0 27-27 27H85q-27 0-27-27V169q0-27 27-27z" fill="#b57844" stroke="#171819" stroke-width="10"/><path d="M58 201h192M131 142v59" stroke="#171819" stroke-width="7"/><circle cx="155" cy="218" r="12" fill="#f1ca62" stroke="#171819" stroke-width="5"/>'''),
    "cuff": (105, 80, '''<rect x="7" y="9" width="91" height="62" rx="17" fill="#202b36" stroke="#171819" stroke-width="8"/><path d="M26 24l7 12-7 12M52 24l7 12-7 12M78 24l7 12-7 12" fill="none" stroke="#e6d8bc" stroke-width="7" stroke-linecap="round"/>'''),
    "clips": (130, 100, '''<path d="M38 22q15 17 0 37M92 22q-15 17 0 37" fill="none" stroke="#39796f" stroke-width="8"/><circle cx="25" cy="66" r="19" fill="#ed4d25" stroke="#171819" stroke-width="6"/><circle cx="57" cy="66" r="19" fill="#ed4d25" stroke="#171819" stroke-width="6"/><circle cx="73" cy="66" r="19" fill="#ed4d25" stroke="#171819" stroke-width="6"/><circle cx="105" cy="66" r="19" fill="#ed4d25" stroke="#171819" stroke-width="6"/>'''),
    "choker": (190, 80, '''<path d="M8 16q87 47 174 0" fill="none" stroke="#202b36" stroke-width="15"/><path d="M95 35l8 16 18 2-13 12 4 18-17-9-17 9 4-18-13-12 18-2z" fill="#f1ca62" stroke="#171819" stroke-width="5"/>'''),
    "wallet": (160, 195, '''<rect x="9" y="9" width="112" height="78" rx="13" fill="#8d4f3b" stroke="#171819" stroke-width="8"/><path d="M64 88q-4 56 67 54 31-1 17 39" fill="none" stroke="#f1ca62" stroke-width="9" stroke-dasharray="3 12" stroke-linecap="round"/><circle cx="65" cy="48" r="9" fill="#f1ca62"/><path d="M18 30h91" stroke="#d39a65" stroke-width="6"/>'''),
}


def build_characters() -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for collection in ("male", "female"):
        for face in FACE_KEYS:
            for bottom in range(3):
                for top in range(3):
                    asset_id = f"{collection}-t{top}-b{bottom}-{face}"
                    asset = write_svg(
                        OUTPUT_ROOT / "characters" / f"{asset_id}.svg",
                        character_body(collection, top, bottom, face),
                        *CHARACTER_SIZE,
                        f"HitMeUp {collection} avatar, {TOP_NAMES[collection][top]}, {BOTTOM_NAMES[collection][bottom]}, {face} expression",
                    )
                    output.append({"id": asset_id, "collection": collection, "top": top, "topName": TOP_NAMES[collection][top], "bottom": bottom, "bottomName": BOTTOM_NAMES[collection][bottom], "face": face, "faceName": face.title(), "tier": "paid" if top == 2 or bottom == 2 else "free", **asset})
    return output


def build_accessories() -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for item in ACCESSORY_LAYOUT:
        width, height, body = ACCESSORY_SVGS[item["id"]]
        asset = write_svg(OUTPUT_ROOT / "accessories" / f"{item['id']}.svg", body, width, height, f"HitMeUp {item['name']} avatar accessory")
        output.append({**item, "tier": "paid" if item["id"] in PAID_ACCESSORIES else "free", "availableIn": [collection for collection, ids in COLLECTIONS.items() if item["id"] in ids], **asset})
    return output


def main() -> None:
    for directory in (OUTPUT_ROOT / "characters", OUTPUT_ROOT / "accessories"):
        if directory.exists():
            shutil.rmtree(directory)
    manifest = {
        "schemaVersion": 2,
        "source": {
            "creator": "HitMeUp",
            "licenseStatus": "approved",
            "generation": "deterministic procedural SVG",
            "thirdPartyImageInputs": False,
            "note": "Original vector artwork generated in this repository. Laura's prototype raster bytes are not used or distributed.",
        },
        "characters": build_characters(),
        "accessories": build_accessories(),
        "backgrounds": [{"tier": item.get("tier", "free"), **item} for item in BACKGROUNDS],
        "commerce": {
            "sourceOfTruth": "authenticated backend catalog and ownership endpoints",
            "tierNote": "Tier is presentation metadata only; purchase, reward balance, ownership, and equip state are always server-validated.",
        },
    }
    (OUTPUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    assert len(manifest["characters"]) == 54
    assert len(manifest["accessories"]) == 15
    assert len(manifest["backgrounds"]) == 12
    assert not list(OUTPUT_ROOT.rglob("*.webp"))
    print("Generated 54 character SVGs, 15 accessory SVGs, 12 CSS background definitions.")


if __name__ == "__main__":
    main()
