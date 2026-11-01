import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import StarterKit from "@tiptap/starter-kit";
import { fontFamily, fontSizePoints } from "./pageLayout.ts";

const characterFont = FontFamily.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element: HTMLElement) => firstFamily(element.style.fontFamily),
            renderHTML: (attributes: { fontFamily?: string | null }) => {
              if (!attributes.fontFamily) {
                return {};
              }
              return { style: `font-family: ${fontFamily(attributes.fontFamily)}` };
            },
          },
        },
      },
    ];
  },
});

const characterSize = FontSize.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: { fontSize?: string | null }) => {
              const points = fontSizePoints(attributes.fontSize ?? null);
              if (!points) {
                return {};
              }
              return { style: `font-size: calc(${points} * var(--editor-pt) * 1px)` };
            },
          },
        },
      },
    ];
  },
});

function firstFamily(value: string): string | null {
  const first = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "") ?? "";
  return first || null;
}

export const documentExtensions = [
  StarterKit.configure({
    heading: false,
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    link: false,
  }),
  TextStyle,
  characterFont,
  characterSize,
  Superscript,
  Subscript,
];
