import type { BundledFontFamily } from "./bundledFonts.ts";
import type { FontBytes, FontSlot } from "./pdfFont.ts";
import monoBold from "./fonts/liberation/LiberationMono-Bold.ttf?url";
import monoBoldItalic from "./fonts/liberation/LiberationMono-BoldItalic.ttf?url";
import monoItalic from "./fonts/liberation/LiberationMono-Italic.ttf?url";
import monoRegular from "./fonts/liberation/LiberationMono-Regular.ttf?url";
import sansBold from "./fonts/liberation/LiberationSans-Bold.ttf?url";
import sansBoldItalic from "./fonts/liberation/LiberationSans-BoldItalic.ttf?url";
import sansItalic from "./fonts/liberation/LiberationSans-Italic.ttf?url";
import sansRegular from "./fonts/liberation/LiberationSans-Regular.ttf?url";
import serifBold from "./fonts/liberation/LiberationSerif-Bold.ttf?url";
import serifBoldItalic from "./fonts/liberation/LiberationSerif-BoldItalic.ttf?url";
import serifItalic from "./fonts/liberation/LiberationSerif-Italic.ttf?url";
import serifRegular from "./fonts/liberation/LiberationSerif-Regular.ttf?url";

const faces: Record<BundledFontFamily, Record<FontSlot, string>> = {
  "Liberation Serif": {
    regular: serifRegular,
    bold: serifBold,
    italic: serifItalic,
    boldItalic: serifBoldItalic,
  },
  "Liberation Sans": {
    regular: sansRegular,
    bold: sansBold,
    italic: sansItalic,
    boldItalic: sansBoldItalic,
  },
  "Liberation Mono": {
    regular: monoRegular,
    bold: monoBold,
    italic: monoItalic,
    boldItalic: monoBoldItalic,
  },
};

export async function bundledFace(family: BundledFontFamily, style: FontSlot): Promise<FontBytes> {
  const url = faces[family][style];
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load the bundled font ${family}.`);
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    postscript: "",
    index: 0,
  };
}
