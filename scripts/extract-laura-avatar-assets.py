#!/usr/bin/env python3
"""Extract Laura's real raster artwork from the approved Cursor source ref.

The old standalone studio is intentionally not restored. This script reads its
source atlases directly from git, removes the white/checker matte using the same
rule as Laura's prototype, and writes only the character/accessory cut-outs used
by the React marketplace.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / "public/avatar/laura"
DEFAULT_SOURCE_REF = "refs/remotes/cursor-source/merge-laura-avatar-marketplace-616f"
SOURCE_DIRECTORY = "public/avatar-customizer/assets"
FACE_KEYS = ("default", "happy", "playful")
TOP_NAMES = {"male": ("Original jacket", "Utility overshirt", "Star tee"), "female": ("Red jacket", "Star tee", "Teal hoodie")}
BOTTOM_NAMES = {"male": ("Black cargos", "Baggy denim", "Street shorts"), "female": ("Black cargos", "Tartan skirt", "Baggy denim")}
COLLECTIONS = {
    "male": ("frames", "shades", "headphones", "cap", "beanie", "chain", "hoops", "bag", "cuff", "wallet"),
    "female": ("hearts", "frames", "shades", "headphones", "bow", "clips", "stars", "hoops", "choker", "chain", "bag", "beanie"),
}
ACCESSORIES: tuple[dict[str, Any], ...] = (
    {"id": "frames", "name": "Clear frames", "source": "accessories-v3.png", "crop": (40, 135, 550, 182), "matte": "checker", "group": "eyewear", "x": .50, "y": .19, "width": .43, "order": 5},
    {"id": "shades", "name": "Shades", "source": "accessories-v3.png", "crop": (647, 134, 573, 190), "matte": "checker", "group": "eyewear", "x": .50, "y": .19, "width": .43, "order": 5},
    {"id": "headphones", "name": "Headphones", "source": "accessories-v3.png", "crop": (38, 357, 560, 460), "matte": "checker", "group": "headphones", "x": .50, "y": .18, "width": .62, "order": 4},
    {"id": "cap", "name": "Star cap", "source": "accessories-v3.png", "crop": (681, 421, 516, 365), "matte": "checker", "group": "headwear", "x": .50, "y": .085, "width": .61, "order": 3},
    {"id": "chain", "name": "Star chain", "source": "accessories-v3.png", "crop": (145, 820, 345, 392), "matte": "checker", "group": "neckwear", "x": .50, "y": .38, "width": .27, "order": 2},
    {"id": "hoops", "name": "Gold hoops", "source": "accessories-v3.png", "crop": (724, 927, 422, 201), "matte": "checker", "group": "earrings", "x": .50, "y": .275, "width": .53, "order": 1},
    {"id": "bow", "name": "Red bow", "source": "extras-v4.png", "slot": 0, "group": "hair", "x": .68, "y": .12, "width": .22, "order": 6},
    {"id": "hearts", "name": "Heart frames", "source": "extras-v4.png", "slot": 1, "group": "eyewear", "x": .50, "y": .19, "width": .43, "order": 5},
    {"id": "stars", "name": "Star earrings", "source": "extras-v4.png", "slot": 2, "group": "earrings", "x": .50, "y": .28, "width": .54, "order": 1},
    {"id": "beanie", "name": "Night beanie", "source": "extras-v4.png", "slot": 3, "group": "headwear", "x": .50, "y": .085, "width": .62, "heightScale": .72, "order": 3},
    {"id": "bag", "name": "Crossbody bag", "source": "extras-v4.png", "slot": 4, "group": "bag", "x": .57, "y": .55, "width": .58, "order": 2},
    {"id": "cuff", "name": "Studded cuff", "source": "extras-v4.png", "slot": 5, "group": "wrist", "x": .77, "y": .64, "width": .16, "order": 6},
    {"id": "clips", "name": "Cherry clips", "source": "extras-v4.png", "slot": 6, "group": "hair", "x": .67, "y": .125, "width": .17, "order": 6},
    {"id": "choker", "name": "Star choker", "source": "extras-v4.png", "slot": 7, "group": "neckwear", "x": .50, "y": .355, "width": .25, "order": 2},
    {"id": "wallet", "name": "Wallet chain", "source": "extras-v4.png", "slot": 8, "group": "wallet", "x": .68, "y": .67, "width": .24, "order": 2},
)
EXTRA_CELLS = ((48, 56, 323, 344), (418, 134, 418, 180), (904, 70, 254, 307), (26, 469, 388, 351), (449, 416, 355, 454), (875, 542, 325, 229), (47, 911, 341, 244), (444, 935, 368, 244), (886, 879, 322, 322))
PAID_ACCESSORIES = {"beanie", "bag", "wallet", "stars", "choker"}
BACKGROUNDS = (
    {"id": "signal", "name": "Signal orange", "color": "#ed4d25"}, {"id": "petrol", "name": "Petrol blue", "color": "#527b7a"},
    {"id": "gold", "name": "Golden hour", "color": "#b8934b"}, {"id": "purple", "name": "Purple haze", "color": "#8d638e"},
    {"id": "dark", "name": "After dark", "color": "#343934"}, {"id": "rose", "name": "Rose paper", "color": "#d8afaa"},
    {"id": "check", "name": "Checkmate", "color": "#ef4d24", "pattern": "check"}, {"id": "burst", "name": "Noise burst", "color": "#ed4d25", "pattern": "burst", "tier": "paid"},
    {"id": "dots", "name": "Dot matrix", "color": "#ddd09e", "pattern": "dots"}, {"id": "wave", "name": "Sound wave", "color": "#497e80", "pattern": "wave", "tier": "paid"},
    {"id": "tape", "name": "Cut & paste", "color": "#d8b0c1", "pattern": "tape"}, {"id": "grid", "name": "Midnight grid", "color": "#202b36", "pattern": "grid", "tier": "paid"},
)

def git_blob(source_ref: str, filename: str) -> bytes:
    return subprocess.run(["git", "show", f"{source_ref}:{SOURCE_DIRECTORY}/{filename}"], cwd=ROOT, check=True, stdout=subprocess.PIPE).stdout

def remove_matte(image: Image.Image, matte: str) -> Image.Image:
    rgba = image.convert("RGBA")
    threshold = 155 if matte == "checker" else 195
    pixels = []
    for red, green, blue, alpha in rgba.getdata():
        high, low = max(red, green, blue), min(red, green, blue)
        pixels.append((red, green, blue, 0 if low > threshold and high - low < 22 else alpha))
    rgba.putdata(pixels)
    alpha = rgba.getchannel("A").point(lambda value: 255 if value > 100 else 0)
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("Empty artwork after matte removal")
    return rgba.crop(bounds)

def cutout(image: Image.Image, crop: tuple[int, int, int, int] | None = None, matte: str = "white") -> Image.Image:
    if crop is not None:
        x, y, width, height = crop
        image = image.crop((x, y, x + width, y + height))
    return remove_matte(image, matte)

def write_png(path: Path, image: Image.Image) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)
    contents = path.read_bytes()
    return {"file": "/" + path.relative_to(ROOT / "public").as_posix(), "pixelWidth": image.width, "pixelHeight": image.height, "sha256": hashlib.sha256(contents).hexdigest()}

def build_characters(images: dict[str, Image.Image]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for collection in ("male", "female"):
        for face, face_key in enumerate(FACE_KEYS):
            atlas_name = f"{collection}-mix-{face_key}.png"
            atlas = images[atlas_name]
            cell_width, cell_height = atlas.width // 3, atlas.height // 3
            for bottom in range(3):
                for top in range(3):
                    source_name = atlas_name
                    if collection == "male" and top == 0 and bottom == 0 and face == 0:
                        source_name = "character-v3.png"
                        image = cutout(images[source_name], matte="checker")
                    else:
                        image = cutout(atlas, (top * cell_width, bottom * cell_height, cell_width, cell_height), "checker")
                    asset_id = f"{collection}-t{top}-b{bottom}-{face_key}"
                    asset = write_png(OUTPUT_ROOT / "characters" / f"{asset_id}.png", image)
                    output.append({"id": asset_id, "collection": collection, "top": top, "topName": TOP_NAMES[collection][top], "bottom": bottom, "bottomName": BOTTOM_NAMES[collection][bottom], "face": face_key, "faceName": face_key.title(), "tier": "paid" if top == 2 or bottom == 2 else "free", "sourceAtlas": source_name, **asset})
    return output

def build_accessories(images: dict[str, Image.Image]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for item in ACCESSORIES:
        crop = item.get("crop") or EXTRA_CELLS[item["slot"]]
        image = cutout(images[item["source"]], crop, item.get("matte", "white"))
        asset = write_png(OUTPUT_ROOT / "accessories" / f"{item['id']}.png", image)
        public_item = {key: value for key, value in item.items() if key not in {"crop", "matte", "slot", "source"}}
        output.append({**public_item, "tier": "paid" if item["id"] in PAID_ACCESSORIES else "free", "availableIn": [collection for collection, ids in COLLECTIONS.items() if item["id"] in ids], "sourceAtlas": item["source"], **asset})
    return output

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-ref", default=DEFAULT_SOURCE_REF)
    args = parser.parse_args()
    source_names = {"character-v3.png", "accessories-v3.png", "extras-v4.png"}
    source_names.update(f"{collection}-mix-{face}.png" for collection in ("male", "female") for face in FACE_KEYS)
    source_blobs = {name: git_blob(args.source_ref, name) for name in sorted(source_names)}
    images = {name: Image.open(io.BytesIO(blob)).copy() for name, blob in source_blobs.items()}
    for directory in (OUTPUT_ROOT / "characters", OUTPUT_ROOT / "accessories"):
        if directory.exists(): shutil.rmtree(directory)
    manifest = {
        "schemaVersion": 3,
        "source": {"creator": "Laura", "licenseStatus": "project-supplied", "generation": "lossless cut-outs from Laura's raster atlases", "gitRef": args.source_ref, "thirdPartyImageInputs": True, "sourceSha256": {name: hashlib.sha256(blob).hexdigest() for name, blob in source_blobs.items()}, "note": "Actual Laura artwork extracted from the approved Cursor source ref; no character or accessory is procedurally redrawn."},
        "characters": build_characters(images), "accessories": build_accessories(images),
        "backgrounds": [{"tier": item.get("tier", "free"), **item} for item in BACKGROUNDS],
        "commerce": {"sourceOfTruth": "authenticated backend catalog and ownership endpoints", "tierNote": "Tier is presentation metadata only; purchase, reward balance, ownership, and equip state are always server-validated."},
    }
    (OUTPUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    assert len(manifest["characters"]) == 54 and len(manifest["accessories"]) == 15
    assert not list(OUTPUT_ROOT.rglob("*.svg"))
    print("Extracted 54 character PNGs and 15 accessory PNGs from Laura's source atlases.")

if __name__ == "__main__": main()
