import { useEffect, useState } from "react";
import { reportFailure } from "./failures.ts";
import { defaultFont, fontFamily } from "./pageLayout.ts";
import { listFonts } from "./storage.ts";

export function FontChoice({
  value,
  onChange,
  ariaLabel,
  className,
  disabled = false,
  inherit = false,
}: {
  value: string;
  onChange: (font: string) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  inherit?: boolean;
}) {
  const fonts = useFontNames();
  const listed = value && !value.startsWith(".") && !fonts.includes(value) ? [value, ...fonts] : fonts;
  return (
    <select
      className={className}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      {inherit ? <option value="">Manuscript font</option> : null}
      {listed.map((name) => (
        <option key={name} value={name} style={{ fontFamily: fontFamily(name) }}>
          {name}
        </option>
      ))}
    </select>
  );
}

function useFontNames(): string[] {
  const [fonts, setFonts] = useState<string[]>(fontNames ?? [defaultFont]);
  useEffect(() => {
    let live = true;
    void fontCatalog().then((names) => {
      if (live) {
        setFonts(names);
      }
    });
    return () => {
      live = false;
    };
  }, []);
  return fonts;
}

let fontNames: string[] | null = null;
let fontCatalogPromise: Promise<string[]> | null = null;

function fontCatalog(): Promise<string[]> {
  if (fontNames) {
    return Promise.resolve(fontNames);
  }
  if (!fontCatalogPromise) {
    fontCatalogPromise = listFonts()
      .then((names) => {
        const available = new Set([defaultFont, ...names]);
        fontNames = [...available].sort((a, b) => a.localeCompare(b));
        return fontNames;
      })
      .catch((error: unknown) => {
        reportFailure(error, "Could not list fonts.");
        fontNames = [defaultFont];
        return fontNames;
      });
  }
  return fontCatalogPromise;
}
