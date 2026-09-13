import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("maplibre-gl/package.json"));
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

async function sha256(path: string) {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

describe("vendored MapLibre worker assets", () => {
  it.each(["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"])(
    "matches the installed package: %s",
    async (name) => {
      const installed = await sha256(join(packageRoot, "dist", name));
      const vendored = await sha256(join(projectRoot, "public", "vendor", "maplibre", name));

      expect(vendored).toEqual(installed);
    },
  );
});
