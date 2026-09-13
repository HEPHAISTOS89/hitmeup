// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AVATAR_MARKETPLACE_CATALOG } from "@/lib/avatar-marketplace-catalog";
import type { AvatarMarketplaceProjection, ProfileProjection } from "@/lib/types";
import { ProfileAvatarPicture } from "./profile-avatar-link";

afterEach(cleanup);

const profile: ProfileProjection = {
  displayName: "Taylor Garcia",
  avatarUrl: null,
  bio: null,
  eduDomain: "ttu.edu",
  solanaWallet: null,
  interests: [],
  avatarConfig: { skin: "golden", face: "smile", hair: "curls", hairColor: "ink", outfit: "hoodie", accessory: "none" },
  rating: null,
  ratingCount: 0,
  completedCount: 0,
};

function marketplace(equipped: string[]): AvatarMarketplaceProjection[] {
  return AVATAR_MARKETPLACE_CATALOG.map((item) => ({
    ...item,
    collections: [...item.collections],
    owned: true,
    equipped: equipped.includes(item.sku),
    network: item.unlockMethod === "solana_devnet" ? "devnet" : null,
  }));
}

describe("profile Laura avatar projection", () => {
  it("feeds the refreshed server marketplace projection to both portal avatar surfaces", () => {
    const portal = readFileSync(resolve(process.cwd(), "src/components/campus-marketplace.tsx"), "utf8");
    expect(portal).toContain("getAvatarMarketplace()");
    expect(portal.match(/marketplaceItems=\{avatarMarketplace\}/g)).toHaveLength(2);
  });

  it("uses Laura in preview before a marketplace response exists", () => {
    render(<ProfileAvatarPicture profile={profile} />);

    expect(screen.getByRole("img", { name: "Taylor Garcia's avatar" })).toHaveAttribute("data-collection", "male");
    expect(screen.getByRole("img", { name: "Taylor Garcia's avatar" })).toHaveAttribute("data-expression", "default");
  });

  it("reflects the server-equipped collection, top, bottom and expression after load and reload", () => {
    const { rerender } = render(<ProfileAvatarPicture profile={profile} marketplaceItems={marketplace([
      "avatar.collection.female",
      "avatar.top.female.teal-hoodie",
      "avatar.bottom.female.tartan-skirt",
      "avatar.expression.happy",
      "avatar.accessory.stars",
      "avatar.background.grid",
    ])} />);

    const avatar = screen.getByRole("img", { name: "Taylor Garcia's avatar" });
    expect(avatar).toHaveAttribute("data-collection", "female");
    expect(avatar).toHaveAttribute("data-top", "2");
    expect(avatar).toHaveAttribute("data-bottom", "1");
    expect(avatar).toHaveAttribute("data-expression", "happy");
    expect(avatar).toHaveAttribute("data-accessories", "stars");
    expect(avatar).toHaveAttribute("data-background", "grid");
    expect(avatar).toHaveClass("laura-background-grid");
    expect(avatar.querySelector('img[src*="stars.png"]')).toHaveClass("laura-profile-accessory");

    rerender(<ProfileAvatarPicture profile={profile} marketplaceItems={marketplace([
      "avatar.collection.male",
      "avatar.top.male.utility-overshirt",
      "avatar.bottom.male.street-shorts",
      "avatar.expression.playful",
    ])} />);

    expect(avatar).toHaveAttribute("data-collection", "male");
    expect(avatar).toHaveAttribute("data-top", "1");
    expect(avatar).toHaveAttribute("data-bottom", "2");
    expect(avatar).toHaveAttribute("data-expression", "playful");
    expect(avatar).toHaveAttribute("data-accessories", "");
    expect(avatar).toHaveAttribute("data-background", "signal");
  });

  it("does not misrepresent a loading or failed marketplace response as a saved server loadout", () => {
    const { rerender } = render(<ProfileAvatarPicture profile={profile} marketplaceStatus="loading" />);
    expect(screen.getByRole("img", { name: "Taylor Garcia's avatar is loading" })).toHaveAttribute("data-avatar-status", "loading");
    expect(screen.queryByRole("img", { name: "Taylor Garcia's avatar" })).not.toBeInTheDocument();

    rerender(<ProfileAvatarPicture profile={profile} marketplaceStatus="error" />);
    expect(screen.getByRole("img", { name: "Taylor Garcia's avatar is unavailable" })).toHaveAttribute("data-avatar-status", "error");
  });

  it("uses an intentional upper-body raster crop instead of object-fit cover", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain(".laura-profile-avatar .student-avatar");
    expect(css).toContain("width: 116%");
    expect(css).not.toMatch(/\.laura-profile-avatar \.student-avatar[^}]*object-fit:\s*cover/);
  });
});
