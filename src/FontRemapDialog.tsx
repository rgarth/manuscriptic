import { useState } from "react";
import { FontChoice } from "./FontChoice.tsx";
import { defaultFont } from "./pageLayout.ts";
import type { FontRemapAsk, FontReplacements } from "./bookFonts.ts";

export default function FontRemapDialog({
  ask,
  onRemap,
  onCancel,
}: {
  ask: FontRemapAsk;
  onRemap: (picks: FontReplacements) => void;
  onCancel: () => void;
}) {
  const [picks, setPicks] = useState<FontReplacements>(() => {
    const initial: FontReplacements = {};
    const fallback = ask.available.includes(defaultFont) ? defaultFont : (ask.available[0] ?? defaultFont);
    for (const name of ask.missing) {
      initial[name] = fallback;
    }
    return initial;
  });

  return (
    <div className="dialog-backdrop">
      <div className="dialog settings" role="dialog" aria-modal="true" aria-label="Missing fonts">
        <header className="settings-bar">
          <h2>Missing fonts</h2>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </header>
        <div className="settings-body">
          <section className="settings-pane">
            <p>
              This book names fonts that are not installed on this computer. Install them, or choose a replacement for
              each. Remapping updates the book to use those faces.
            </p>
            <div className="font-remap-list">
              {ask.missing.map((name) => (
                <label key={name} className="compile-choice-label">
                  {name}
                  <FontChoice
                    ariaLabel={`Replacement for ${name}`}
                    value={picks[name] ?? defaultFont}
                    fonts={ask.available}
                    onChange={(standIn) => setPicks((current) => ({ ...current, [name]: standIn }))}
                  />
                </label>
              ))}
            </div>
            <div className="dialog-actions">
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" onClick={() => onRemap(picks)}>
                Remap fonts
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
