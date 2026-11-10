export const bundledFontFamilies = ["Liberation Serif", "Liberation Sans", "Liberation Mono"] as const;

export type BundledFontFamily = (typeof bundledFontFamilies)[number];

export function isBundledFontFamily(name: string): name is BundledFontFamily {
  return (bundledFontFamilies as readonly string[]).includes(name);
}

export function cssGenericFor(family: BundledFontFamily): "serif" | "sans-serif" | "monospace" {
  switch (family) {
    case "Liberation Serif":
      return "serif";
    case "Liberation Sans":
      return "sans-serif";
    case "Liberation Mono":
      return "monospace";
    default: {
      const unexpected: never = family;
      return unexpected;
    }
  }
}
