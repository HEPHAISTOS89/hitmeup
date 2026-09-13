import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../public/avatar/laura/manifest.json";

const root = process.cwd();
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("Laura avatar asset provenance", () => {
  it("matches every recorded source atlas to the approved Cursor ref", () => {
    for (const [name, sha256] of Object.entries(manifest.source.sourceSha256)) {
      const bytes = execFileSync("git", ["show", `${manifest.source.gitRef}:public/avatar-customizer/assets/${name}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
      expect(digest(bytes), name).toBe(sha256);
    }
  });

  it("ships only hashed PNG cut-outs for Laura character and accessory art", () => {
    const assets = [...manifest.characters, ...manifest.accessories];
    expect(assets).toHaveLength(69);
    for (const asset of assets) {
      expect(asset.file.endsWith(".png"), asset.file).toBe(true);
      expect(asset.sourceAtlas).toBeTruthy();
      expect(digest(readFileSync(join(root, "public", asset.file))), asset.file).toBe(asset.sha256);
    }
  });
});
