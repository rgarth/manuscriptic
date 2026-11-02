import { Extension, type Editor } from "@tiptap/core";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import StarterKit from "@tiptap/starter-kit";
import { alignmentOrNull, fontFamily, fontSizePoints, type Alignment } from "./pageLayout.ts";

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

const paragraphAlign = Extension.create({
  name: "paragraphAlign",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          align: {
            default: null,
            parseHTML: (element: HTMLElement) => alignmentOrNull(element.style.textAlign),
            renderHTML: (attributes: { align?: string | null }) => {
              const align = alignmentOrNull(attributes.align);
              if (!align) {
                return {};
              }
              return { style: `text-align: ${align}` };
            },
          },
        },
      },
    ];
  },
});

export function shownParagraphAlign(editor: Editor, inherited: Alignment): Alignment {
  return alignmentOrNull(editor.getAttributes("paragraph").align) ?? inherited;
}

export function applyParagraphAlign(editor: Editor, align: Alignment, inherited: Alignment): void {
  const stored = align === inherited ? null : align;
  editor.chain().focus().updateAttributes("paragraph", { align: stored }).run();
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
  paragraphAlign,
  TextStyle,
  characterFont,
  characterSize,
  Superscript,
  Subscript,
];
