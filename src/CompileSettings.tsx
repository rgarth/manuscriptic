import { useState } from "react";
import {
  compilePreferences,
  readCompilePreferences,
  writeCompilePreferences,
  type CompilePreferences,
  type CompileSpacing,
  type PageNumbers,
} from "./compilePrefs.ts";
import { failureMessage, reportFailure } from "./failures.ts";
import { alignments } from "./pageLayout.ts";
import {
  chapterHeadings,
  sceneBreaks,
  type BookCompile,
  type ChapterHeading,
  type CompileLevel,
  type LevelHeading,
  type SceneBreak,
} from "./model/project.ts";

type CompilePane = "common" | "docx";

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

export default function CompileSettings({
  book,
}: {
  book: { compile: BookCompile; onCompile: (compile: BookCompile) => void } | null;
}) {
  const [pane, setPane] = useState<CompilePane>("common");
  const [prefs, setPrefs] = useState<CompilePreferences>(() => {
    try {
      return readCompilePreferences(localStorage);
    } catch (error: unknown) {
      reportFailure(error, "Compile settings could not be read.");
      return compilePreferences(null);
    }
  });
  const [error, setError] = useState<string | null>(null);

  function save(next: CompilePreferences) {
    try {
      writeCompilePreferences(localStorage, next);
      setPrefs(readCompilePreferences(localStorage));
      setError(null);
    } catch (caught: unknown) {
      const message = failureMessage(caught, "Could not save this preference.");
      setError(message);
      reportFailure(message, message);
    }
  }

  function change(patch: Partial<CompilePreferences>) {
    save({ ...prefs, ...patch });
  }

  return (
    <>
      <h3>Compile</h3>
      <div className="segmented" role="group" aria-label="Compile settings">
        <button type="button" aria-pressed={pane === "common"} onClick={() => setPane("common")}>
          Common
        </button>
        <button type="button" aria-pressed={pane === "docx"} onClick={() => setPane("docx")}>
          Docx
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {pane === "common" ? (
        <CommonSettings prefs={prefs} book={book} onChange={change} />
      ) : (
        <DocxSettings prefs={prefs} onChange={change} />
      )}
    </>
  );
}

function CommonSettings({
  prefs,
  book,
  onChange,
}: {
  prefs: CompilePreferences;
  book: { compile: BookCompile; onCompile: (compile: BookCompile) => void } | null;
  onChange: (patch: Partial<CompilePreferences>) => void;
}) {
  return (
    <>
      <Field label="Author" value={prefs.author} onChange={(author) => onChange({ author })} />
      <Field label="Pen name" value={prefs.pen} onChange={(pen) => onChange({ pen })} />
      <Field label="Address" value={prefs.address} onChange={(address) => onChange({ address })} multiline />
      <Field label="Phone" value={prefs.phone} onChange={(phone) => onChange({ phone })} />
      <Field label="Email" value={prefs.email} onChange={(email) => onChange({ email })} />
      <Field label="Header" value={prefs.header} onChange={(header) => onChange({ header })} />
      <Field label="Footer" value={prefs.footer} onChange={(footer) => onChange({ footer })} />
      <Choice
        label="Page numbers"
        value={prefs.pageNumbers}
        options={(["off", "header", "footer"] as const).map((id) => ({ id, label: numberChoice[id] }))}
        onChange={(pageNumbers) => onChange({ pageNumbers })}
      />
      <label className="preference">
        <input
          type="checkbox"
          checked={prefs.differentFirstPage}
          onChange={(event) => onChange({ differentFirstPage: event.currentTarget.checked })}
        />
        Different first page
      </label>
      <MarginFields prefs={prefs} onChange={onChange} />
      {book ? <BookStructure compile={book.compile} onCompile={book.onCompile} /> : null}
    </>
  );
}

function DocxSettings({
  prefs,
  onChange,
}: {
  prefs: CompilePreferences;
  onChange: (patch: Partial<CompilePreferences>) => void;
}) {
  return (
    <>
      <label className="preference">
        <input
          type="checkbox"
          checked={prefs.passFont}
          onChange={(event) => onChange({ passFont: event.currentTarget.checked })}
        />
        Use the book’s font and size
      </label>
      <Field label="Font" value={prefs.font} onChange={(font) => onChange({ font })} disabled={prefs.passFont} />
      <Field
        label="Size"
        value={String(prefs.points)}
        onChange={(points) => onChange({ points: Number(points) })}
        disabled={prefs.passFont}
      />
      <Choice
        label="Line spacing"
        value={prefs.spacing}
        options={(["single", "onehalf", "double"] as const).map((id) => ({ id, label: spacingChoice[id] }))}
        onChange={(spacing) => onChange({ spacing })}
      />
      <Field label="Space before" value={String(prefs.spaceBefore)} onChange={(spaceBefore) => onChange({ spaceBefore: Number(spaceBefore) })} />
      <Field label="Space after" value={String(prefs.spaceAfter)} onChange={(spaceAfter) => onChange({ spaceAfter: Number(spaceAfter) })} />
      <Field label="First-line indent" value={String(prefs.indent)} onChange={(indent) => onChange({ indent: Number(indent) })} />
      <Choice
        label="Alignment"
        value={prefs.align}
        options={alignments.map((item) => ({ id: item.id, label: item.label }))}
        onChange={(align) => onChange({ align })}
      />
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
      <p className="settings-value">
        From the pages outward. Include a level to make it a division. The innermost division starts the page, and the
        divisions around it share that page. A level left out is only organization.
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
          />
          {index > 0 && index === compile.levels.length - 1 ? (
            <button type="button" onClick={() => onCompile({ ...compile, levels: compile.levels.slice(0, -1) })}>
              Remove this level
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
  prefs,
  onChange,
}: {
  prefs: CompilePreferences;
  onChange: (patch: Partial<CompilePreferences>) => void;
}) {
  function edge(side: keyof CompilePreferences["margins"], raw: string) {
    onChange({ margins: { ...prefs.margins, [side]: Number(raw) } });
  }
  return (
    <>
      <Field label="Top margin" value={String(prefs.margins.top)} onChange={(value) => edge("top", value)} />
      <Field label="Right margin" value={String(prefs.margins.right)} onChange={(value) => edge("right", value)} />
      <Field label="Bottom margin" value={String(prefs.margins.bottom)} onChange={(value) => edge("bottom", value)} />
      <Field label="Left margin" value={String(prefs.margins.left)} onChange={(value) => edge("left", value)} />
    </>
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
}: {
  label: string;
  value: Id;
  options: { id: Id; label: string }[];
  onChange: (id: Id) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className="setting">
      <span className="setting-label">{label}</span>
      <div className="segmented" role="group" aria-label={ariaLabel ?? label}>
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
    </div>
  );
}
