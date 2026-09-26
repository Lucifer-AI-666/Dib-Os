import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: {
    select: <T,>(options: { default?: T; web?: T; ios?: T }) =>
      options.default ?? options.web ?? options.ios,
  },
}));

describe("theme colors", () => {
  it("defines every configured color in both light and dark palettes", async () => {
    const { validateThemeColors } = await import("../lib/_core/theme");

    expect(validateThemeColors()).toEqual([]);
  });

  it("reports missing palette entries by scheme and token", async () => {
    const { validateThemeColors } = await import("../lib/_core/theme");

    expect(
      validateThemeColors(
        { primary: { light: "#fff", dark: "#000" } } as never,
        { light: { primary: "#fff" }, dark: {} } as never,
      ),
    ).toEqual(["dark.primary"]);
  });
});
