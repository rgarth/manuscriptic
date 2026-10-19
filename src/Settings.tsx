import { useEffect, useState } from "react";
import { applyTheme, onTheme, readTheme, readThemes } from "./themes";

type SettingsProps = {
  words: string[];
  onAddWord: (word: string) => void;
  onRemoveWord: (word: string) => void;
  onClose: () => void;
};

export default function Settings({ words, onAddWord, onRemoveWord, onClose }: SettingsProps) {
  const themes = readThemes();
  const [theme, setTheme] = useState(() => readTheme(themes));
  const [draft, setDraft] = useState("");

  useEffect(() => onTheme(setTheme), []);

  return (
    <div className="dialog-backdrop">
      <div className="dialog settings" role="dialog" aria-modal="true" aria-label="Settings">
        <h2>Theme</h2>
        <ul className="choice-list">
          {themes.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={item.id === theme}
                onClick={() => applyTheme(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <h2>Project dictionary</h2>
        <p>Words here are spelled correctly in this novel. The list is saved with the book.</p>
        {words.length === 0 ? (
          <p>No extra words yet. Right-click a word in the text to add it.</p>
        ) : (
          <ul className="word-list">
            {words.map((word) => (
              <li key={word.toLocaleLowerCase()}>
                <span>{word}</span>
                <button type="button" onClick={() => onRemoveWord(word)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault();
            onAddWord(draft);
            setDraft("");
          }}
        >
          <input
            aria-label="Add a word"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
          <button type="submit">Add</button>
        </form>
        <h2>Snapshots</h2>
        <p>Dated snapshots are not set up yet. When they are, the timing will be chosen here.</p>
        <div className="row">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
