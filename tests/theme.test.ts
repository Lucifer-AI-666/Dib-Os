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
});
