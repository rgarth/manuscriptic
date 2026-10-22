import { useState } from "react";
import {
  chapterHeadings,
  defaultCompileIdentity,
  sceneBreaks,
  type BookCompile,
  type ChapterHeading,
  type CompileFormat,
  type CompileIdentity,
  type CompileLevel,
  type CompileSpacing,
  type LevelHeading,
  type PageNumbers,
  type SceneBreak,
} from "./bookCompile.ts";
import { readCompileIdentity, writeCompileIdentity } from "./compilePrefs.ts";
import { failureMessage, reportFailure } from "./failures.ts";
import { alignments } from "./pageLayout.ts";

type CompilePane = "author" | "structure" | "formatting";

const writtenChoice = "Already written";

const breakChoice: Record<SceneBreak, string> = {
  hash: "#",
  stars: "* * *",
  blank: "Blank line",
};

const spacingChoice: Record<CompileSpacing, string> = {
  single: "Single",
  onehalf: "1.5",
  double: "Double",
};

const numberChoice: Record<PageNumbers, string> = {
  off: "Off",
  header: "Header",
  footer: "Footer",
};

const panes: { id: CompilePane; label: string }[] = [
  { id: "author", label: "Author" },
  { id: "structure", label: "Structure" },
  { id: "formatting", label: "Formatting" },
];

export function AppAuthorSettings() {
  const [identity, setIdentity] = useState<CompileIdentity>(() => {
    try {
      return readCompileIdentity(localStorage);
    } catch (error: unknown) {
      reportFailure(error, "Author information could not be read.");
      return defaultCompileIdentity();
    }
  });
  const [error, setError] = useState<string | null>(null);

  function change(patch: Partial<CompileIdentity>) {
    const next = { ...identity, ...patch };
    try {
      writeCompileIdentity(localStorage, next);
      setIdentity(readCompileIdentity(localStorage));
      setError(null);
    } catch (caught: unknown) {
      const message = failureMessage(caught, "Could not save this author.");
      setError(message);
      reportFailure(message, message);
    }
  }

  return (
    <>
      <h3>Author</h3>
      {error ? <p role="alert">{error}</p> : null}
      <AuthorFields value={identity} onChange={change} />
    </>
  );
}

export default function CompileSettings({
  compile,
  onCompile,
  onClose,
}: {
  compile: BookCompile;
  onCompile: (compile: BookCompile) => void;
  onClose: () => void;
}) {
  const [pane, setPane] = useState<CompilePane>("author");
  const [appAuthor] = useState<CompileIdentity>(() => {
    try {
      return readCompileIdentity(localStorage);
    } catch (error: unknown) {
      reportFailure(error, "Author information could not be read.");
      return defaultCompileIdentity();
    }
  });

  return (
    <div className="dialog-backdrop">
      <div className="dialog settings" role="dialog" aria-modal="true" aria-label="Compiler Settings">
        <header className="settings-bar">
          <h2>Compiler Settings</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Compiler settings">
            {panes.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === pane ? "page" : undefined}
                onClick={() => setPane(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <section className="settings-pane">{compilerPane(pane, compile, appAuthor, onCompile)}</section>
        </div>
      </div>
    </div>
  );
}

function compilerPane(
  pane: CompilePane,
  compile: BookCompile,
  appAuthor: CompileIdentity,
  onCompile: (compile: BookCompile) => void,
) {
  switch (pane) {
    case "author":
      return <AuthorOverride compile={compile} appAuthor={appAuthor} onCompile={onCompile} />;
    case "structure":
      return <BookStructure compile={compile} onCompile={onCompile} />;
    case "formatting":
      return (
        <FormattingSettings
          format={compile.format}
          onChange={(format) => onCompile({ ...compile, format: { ...compile.format, ...format } })}
        />
      );
    default: {
      const unexpected: never = pane;
      return unexpected;
    }
  }
}

function AuthorOverride({
  compile,
  appAuthor,
  onCompile,
}: {
  compile: BookCompile;
  appAuthor: CompileIdentity;
  onCompile: (compile: BookCompile) => void;
}) {
  const shown = compile.useAppAuthor ? appAuthor : compile.author;
  return (
    <>
      <h3>Author</h3>
      <label className="preference">
        <input
          type="checkbox"
          checked={compile.useAppAuthor}
          onChange={(event) => {
            const useAppAuthor = event.currentTarget.checked;
            onCompile({
              ...compile,
              useAppAuthor,
              author: useAppAuthor || !identityBlank(compile.author) ? compile.author : appAuthor,
            });
          }}
        />
        Use the author in Settings
      </label>
      <AuthorFields
        value={shown}
        disabled={compile.useAppAuthor}
        onChange={(patch) => onCompile({ ...compile, author: { ...compile.author, ...patch } })}
      />
    </>
  );
}

function identityBlank(identity: CompileIdentity): boolean {
  return (
    identity.author === "" &&
    identity.pen === "" &&
    identity.address === "" &&
    identity.phone === "" &&
    identity.email === ""
  );
}

function AuthorFields({
  value,
  onChange,
  disabled = false,
}: {
  value: CompileIdentity;
  onChange: (patch: Partial<CompileIdentity>) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <div className="setting-grid">
        <Field label="Author" value={value.author} disabled={disabled} onChange={(author) => onChange({ author })} />
        <Field label="Pen name" value={value.pen} disabled={disabled} onChange={(pen) => onChange({ pen })} />
        <Field label="Phone" value={value.phone} disabled={disabled} onChange={(phone) => onChange({ phone })} />
        <Field label="Email" value={value.email} disabled={disabled} onChange={(email) => onChange({ email })} />
      </div>
      <Field label="Address" value={value.address} disabled={disabled} multiline onChange={(address) => onChange({ address })} />
    </>
  );
}

function FormattingSettings({
  format,
  onChange,
}: {
  format: CompileFormat;
  onChange: (patch: Partial<CompileFormat>) => void;
}) {
  return (
    <>
      <h3>Formatting</h3>
      <section className="setting-group">
        <h4>Type</h4>
        <label className="preference">
          <input
            type="checkbox"
            checked={format.passFont}
            onChange={(event) => onChange({ passFont: event.currentTarget.checked })}
          />
          Use the book’s font and size
        </label>
        <div className="setting-grid">
          <Field label="Font" value={format.font} onChange={(font) => onChange({ font })} disabled={format.passFont} />
          <Field
            label="Size"
            value={String(format.points)}
            onChange={(points) => onChange({ points: Number(points) })}
            disabled={format.passFont}
          />
        </div>
      </section>
      <section className="setting-group">
        <h4>Paragraph</h4>
        <Choice
          label="Line spacing"
          value={format.spacing}
          options={(["single", "onehalf", "double"] as const).map((id) => ({ id, label: spacingChoice[id] }))}
          onChange={(spacing) => onChange({ spacing })}
        />
        <div className="measure-row">
          <Field label="Space before (pt)" value={String(format.spaceBefore)} onChange={(spaceBefore) => onChange({ spaceBefore: Number(spaceBefore) })} />
          <Field label="Space after (pt)" value={String(format.spaceAfter)} onChange={(spaceAfter) => onChange({ spaceAfter: Number(spaceAfter) })} />
          <Field label="First-line indent (in)" value={String(format.indent)} onChange={(indent) => onChange({ indent: Number(indent) })} />
        </div>
        <Choice
          label="Alignment"
          value={format.align}
          options={alignments.map((item) => ({ id: item.id, label: item.label }))}
          onChange={(align) => onChange({ align })}
        />
      </section>
      <section className="setting-group">
        <h4>Page</h4>
        <MarginFields format={format} onChange={onChange} />
        <Field label="Header" value={format.header} onChange={(header) => onChange({ header })} />
        <Field label="Footer" value={format.footer} onChange={(footer) => onChange({ footer })} />
        <div className="setting-grid">
          <Choice
            label="Page numbers"
            value={format.pageNumbers}
            options={(["off", "header", "footer"] as const).map((id) => ({ id, label: numberChoice[id] }))}
            onChange={(pageNumbers) => onChange({ pageNumbers })}
          />
          <label className="preference">
            <input
              type="checkbox"
              checked={format.differentFirstPage}
              onChange={(event) => onChange({ differentFirstPage: event.currentTarget.checked })}
            />
            Different first page
          </label>
        </div>
      </section>
    </>
  );
}

function BookStructure({
  compile,
  onCompile,
}: {
  compile: BookCompile;
  onCompile: (compile: BookCompile) => void;
}) {
  function changeLevel(index: number, patch: Partial<CompileLevel>) {
    onCompile({
      ...compile,
      levels: compile.levels.map((level, levelIndex) => (levelIndex === index ? { ...level, ...patch } : level)),
    });
  }

  return (
    <>
      <h3>Structure</h3>
      <p className="settings-value">
        Tick a level to include it and choose its heading. An unticked level stays binder organization.
      </p>
      {compile.levels.map((level, index) => (
        <div className="structure-level" key={index}>
          <span className="setting-label">{levelLabel(index)}</span>
          <label className="preference">
            <input
              type="checkbox"
              aria-label={`Include ${levelLabel(index)}`}
              checked={level.include}
              onChange={(event) => changeLevel(index, { include: event.currentTarget.checked })}
            />
            Include
          </label>
          <Field
            label="Name"
            ariaLabel={`${levelLabel(index)} name`}
            value={level.name}
            placeholder="Chapter"
            disabled={!level.include}
            onChange={(name) => changeLevel(index, { name })}
          />
          <Choice
            label="Heading"
            ariaLabel={`${levelLabel(index)} heading`}
            value={level.heading}
            disabled={!level.include}
            options={headingOptions(level.name)}
            onChange={(heading) => changeLevel(index, { heading })}
            menu
          />
          {index > 0 && index === compile.levels.length - 1 ? (
            <button type="button" onClick={() => onCompile({ ...compile, levels: compile.levels.slice(0, -1) })}>
              Remove
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onCompile({
            ...compile,
            levels: [...compile.levels, { include: false, name: "", heading: "title" }],
          })
        }
      >
        Add a folder level
      </button>
      <label className="preference">
        <input
          type="checkbox"
          checked={compile.sceneTitles}
          onChange={(event) => onCompile({ ...compile, sceneTitles: event.currentTarget.checked })}
        />
        Include scene titles
      </label>
      <Choice
        label="Scene break"
        value={compile.sceneBreak}
        options={sceneBreaks.map((id) => ({ id, label: breakChoice[id] }))}
        onChange={(sceneBreak) => onCompile({ ...compile, sceneBreak })}
      />
    </>
  );
}

function levelLabel(index: number): string {
  if (index === 0) {
    return "Pages";
  }
  if (index === 1) {
    return "Folder level 1";
  }
  return `Folder level ${index}`;
}

function headingOptions(name: string): { id: LevelHeading; label: string }[] {
  const label = name.trim() || "Heading";
  const styles: Record<ChapterHeading, string> = {
    title: "Title only",
    number: `${label} 1`,
    numberTitle: `${label} 1: Title`,
    word: `${label} One`,
    written: writtenChoice,
  };
  return [
    { id: "none", label: "No heading" },
    ...chapterHeadings.map((id) => ({ id, label: styles[id] })),
  ];
}

function MarginFields({
  format,
  onChange,
}: {
  format: CompileFormat;
  onChange: (patch: Partial<CompileFormat>) => void;
}) {
  function edge(side: keyof CompileFormat["margins"], raw: string) {
    onChange({ margins: { ...format.margins, [side]: Number(raw) } });
  }
  return (
    <div className="margin-row">
      <span className="setting-label">Margins (inches)</span>
      <Field label="Top" value={String(format.margins.top)} onChange={(value) => edge("top", value)} />
      <Field label="Right" value={String(format.margins.right)} onChange={(value) => edge("right", value)} />
      <Field label="Bottom" value={String(format.margins.bottom)} onChange={(value) => edge("bottom", value)} />
      <Field label="Left" value={String(format.margins.left)} onChange={(value) => edge("left", value)} />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled = false,
  multiline = false,
  placeholder,
  ariaLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const name = ariaLabel ?? label;
  return (
    <label className="setting">
      <span className="setting-label">{label}</span>
      {multiline ? (
        <textarea aria-label={name} value={value} disabled={disabled} rows={3} onChange={(event) => onChange(event.currentTarget.value)} />
      ) : (
        <input
          aria-label={name}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </label>
  );
}

function Choice<Id extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  menu = false,
}: {
  label: string;
  value: Id;
  options: { id: Id; label: string }[];
  onChange: (id: Id) => void;
  disabled?: boolean;
  ariaLabel?: string;
  menu?: boolean;
}) {
  const name = ariaLabel ?? label;
  return (
    <div className="setting">
      <span className="setting-label">{label}</span>
      {menu ? (
        <select
          aria-label={name}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const picked = options[event.currentTarget.selectedIndex];
            if (picked) {
              onChange(picked.id);
            }
          }}
        >
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="segmented" role="group" aria-label={name}>
          {options.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === value}
              disabled={disabled}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
