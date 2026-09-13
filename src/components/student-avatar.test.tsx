// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudentAvatar } from "./student-avatar";

describe("StudentAvatar", () => {
  it("renders a named illustrated avatar without a baked-in background", () => {
    const { container } = render(<StudentAvatar title="Customized student avatar" skin="ebony" hair="locs" outfit="tech" accessory="glasses" />);

    expect(screen.getByRole("img", { name: "Customized student avatar" })).not.toBeNull();
    expect(container.querySelector("svg > rect")).toBeNull();
  });

  it("keeps option thumbnails decorative", () => {
    const { container } = render(<StudentAvatar title="" face="wink" hair="bob" accessory="headphones" />);

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(within(container).queryByRole("img")).toBeNull();
  });
});
