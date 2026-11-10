import { useEffect, useState } from "react";
import { availableFonts, bundledFontFallback, displayFontFamily } from "./bookFonts.ts";
import { reportFailure } from "./failures.ts";

/** Loads the shared font catalog for controls that pick a face. */
export function useAvailableFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>(bundledFontFallback());
  useEffect(() => {
    let live = true;
    void availableFonts()
      .then((names) => {
        if (live) {
          setFonts(names);
        }
      })
      .catch((error: unknown) => {
        reportFailure(error, "Could not list fonts.");
      });
    return () => {
      live = false;
    };
  }, []);
  return fonts;
}

export function FontChoice({
  value,
  onChange,
  ariaLabel,
  className,
  disabled = false,
  inherit = false,
  fonts,
}: {
  value: string;
  onChange: (font: string) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  inherit?: boolean;
  fonts: readonly string[];
}) {
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
        <option key={name} value={name} style={{ fontFamily: displayFontFamily(name) }}>
          {name}
        </option>
      ))}
    </select>
  );
}
