import { useState } from "react";
import {
  defaultCompileIdentity,
  levelAt,
  sceneBreaks,
  withLevel,
  type BookCompile,
  type CompileFormat,
  type CompileHeading,
  type HeadingAlign,
  type CompileIdentity,
  type CompileSpacing,
  type HeadingJoin,
  type NumberStyle,
  type PageNumbers,
  type SceneBreak,
} from "./bookCompile.ts";
import BookContents from "./BookContents.tsx";
import { folderRanks } from "./compileShape.ts";
import { initialCompileTicks } from "./compileTicks.ts";
import { readCompileIdentity, writeCompileIdentity } from "./compilePrefs.ts";
import { failureMessage, reportFailure } from "./failures.ts";
import { addDictionaryWord, removeDictionaryWord, setBookCompile, type FolderNode, type ProjectFile } from "./model/project.ts";
import { FontChoice } from "./FontChoice.tsx";
import { alignments } from "./pageLayout.ts";

type CompilePane = "author" | "structure" | "contents" | "formatting" | "dictionary";

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

const numberOptions: { id: NumberStyle; label: string }[] = [
  { id: "none", label: "None" },
  { id: "arabic", label: "1" },
  { id: "word", label: "One" },
  { id: "roman", label: "i" },
];

const joinOptions: { id: HeadingJoin; label: string }[] = [
  { id: "line", label: "New line" },
  { id: "mark", label: "Character" },
];

const headingAlignments: { id: HeadingAlign; label: string }[] = [
  { id: "left", label: "Align Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Align Right" },
];

const panes: { id: CompilePane; label: string }[] = [
  { id: "author", label: "Author" },
  { id: "structure", label: "Structure" },
  { id: "contents", label: "Contents" },
  { id: "formatting", label: "Formatting" },
  { id: "dictionary", label: "Dictionary" },
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
  project,
  onProject,
  onClose,
}: {
  project: ProjectFile;
  onProject: (update: (project: ProjectFile) => ProjectFile) => void;
  onClose: () => void;
}) {
  function onCompile(next: BookCompile) {
    onProject((current) => setBookCompile(current, next));
  }
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
      <div className="dialog settings" role="dialog" aria-modal="true" aria-label="Book Settings">
        <header className="settings-bar">
          <h2>Book Settings</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Book settings">
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
          <section className={pane === "structure" ? "settings-pane structure-pane" : "settings-pane"}>
            {compilerPane(pane, project, appAuthor, onCompile, onProject)}
          </section>
        </div>
      </div>
    </div>
  );
}

function compilerPane(
  pane: CompilePane,
  project: ProjectFile,
  appAuthor: CompileIdentity,
  onCompile: (compile: BookCompile) => void,
  onProject: (update: (project: ProjectFile) => ProjectFile) => void,
) {
  switch (pane) {
    case "author":
      return <AuthorOverride compile={project.compile} appAuthor={appAuthor} onCompile={onCompile} />;
    case "structure":
      return (
        <BookStructure
          compile={project.compile}
          manuscript={project.manuscript}
          included={initialCompileTicks(project)}
          onCompile={onCompile}
        />
      );
    case "contents":
      return <BookContents project={project} onProject={onProject} />;
    case "formatting":
      return (
        <FormattingSettings
          format={project.compile.format}
          onChange={(format) => onCompile({ ...project.compile, format: { ...project.compile.format, ...format } })}
        />
      );
    case "dictionary":
      return (
        <BookDictionary
          words={project.dictionary}
          onAdd={(word) => onProject((current) => addDictionaryWord(current, word))}
          onRemove={(word) => onProject((current) => removeDictionaryWord(current, word))}
        />
      );
    default: {
      const unexpected: never = pane;
      return unexpected;
    }
  }
}

function BookDictionary({
  words,
  onAdd,
  onRemove,
}: {
  words: readonly string[];
  onAdd: (word: string) => void;
  onRemove: (word: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <>
      <h3>Dictionary</h3>
      {words.length > 0 ? (
        <ul className="word-list">
          {words.map((word) => (
            <li key={word.toLocaleLowerCase()}>
              <span>{word}</span>
              <button type="button" onClick={() => onRemove(word)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd(draft);
          setDraft("");
        }}
      >
        <input aria-label="Add a word" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
        <button type="submit">Add</button>
      </form>
    </>
  );
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
          <FontMenu
            label="Font"
            ariaLabel="Font"
            value={format.font}
            disabled={format.passFont}
            onChange={(font) => onChange({ font })}
          />
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
  manuscript,
  included,
  onCompile,
}: {
  compile: BookCompile;
  manuscript: FolderNode;
  included: ReadonlySet<string>;
  onCompile: (compile: BookCompile) => void;
}) {
  const ranks = folderRanks(manuscript, included);
  const [selected, setSelected] = useState<number | "scenes">(ranks[0] ?? "scenes");
  const shown = selected === "scenes" || ranks.includes(selected) ? selected : (ranks[0] ?? "scenes");
  const place = typeof shown === "number" ? ranks.indexOf(shown) : -1;
  const level = typeof shown === "number" ? levelAt(compile, shown) : null;
  const label = typeof shown === "number" ? levelLabel(place) : "Scenes";
  return (
    <div className="structure-body">
      <nav className="settings-nav structure-nav" aria-label="Manuscript structure">
        {ranks.map((rank, index) => {
          const name = levelLabel(index);
          return (
            <button
              key={rank}
              type="button"
              aria-current={shown === rank ? "page" : undefined}
              onClick={() => setSelected(rank)}
            >
              {name}
            </button>
          );
        })}
        <button type="button" aria-current={shown === "scenes" ? "page" : undefined} onClick={() => setSelected("scenes")}>
          Scenes
        </button>
      </nav>
      <div className="structure-detail">
        <h3>{label}</h3>
        {level && typeof shown === "number" ? (
          <LevelCard
            label={label}
            hint=""
            titleLabel="Include the folder title"
            level={level}
            onChange={(next) => onCompile(withLevel(compile, shown, next))}
          />
        ) : (
          <SceneCard compile={compile} onCompile={onCompile} />
        )}
      </div>
    </div>
  );
}

function levelLabel(place: number): string {
  return `Folder Level ${place + 1}`;
}

function LevelCard({
  label,
  hint,
  titleLabel,
  level,
  onChange,
}: {
  label: string;
  hint: string;
  titleLabel: string;
  level: BookCompile["levels"][number];
  onChange: (level: BookCompile["levels"][number]) => void;
}) {
  return (
    <div className="structure-level">
      <label className="preference">
        <input
          type="checkbox"
          aria-label={`Include ${label}`}
          checked={level.include}
          onChange={(event) => onChange({ ...level, include: event.currentTarget.checked })}
        />
        Include
      </label>
      <HeadingFields
        scope={label}
        heading={level}
        hint={hint}
        titleLabel={titleLabel}
        disabled={!level.include}
        pagesDisabled={!level.include}
        onChange={(patch) => onChange({ ...level, ...patch })}
      />
    </div>
  );
}

function SceneCard({
  compile,
  onCompile,
}: {
  compile: BookCompile;
  onCompile: (compile: BookCompile) => void;
}) {
  const scenes = compile.scenes;
  const titled = scenes.title;
  return (
    <div className="structure-level">
      <label className="preference">
        <input
          type="checkbox"
          aria-label="Include the scene title"
          checked={scenes.title}
          onChange={(event) => onCompile({ ...compile, scenes: { ...scenes, title: event.currentTarget.checked } })}
        />
        Include the scene title
      </label>
      <FontMenu
        label="Font"
        ariaLabel="Scene title font"
        value={scenes.titleFont}
        inherit
        disabled={!titled}
        onChange={(titleFont) => onCompile({ ...compile, scenes: { ...scenes, titleFont } })}
      />
      <Field
        label="Size"
        ariaLabel="Scene title size"
        value={scenes.titlePoints > 0 ? String(scenes.titlePoints) : ""}
        placeholder="Manuscript size"
        disabled={!titled}
        onChange={(value) => onCompile({ ...compile, scenes: { ...scenes, titlePoints: pointSize(value) } })}
      />
      <div className="structure-span">
        <Choice
          label="Alignment"
          ariaLabel="Scene title alignment"
          value={scenes.align}
          disabled={!titled}
          options={headingAlignments}
          onChange={(align) => onCompile({ ...compile, scenes: { ...scenes, align } })}
        />
      </div>
      <div className="structure-span structure-ticks">
        <label className="preference">
          <input
            type="checkbox"
            aria-label="Scenes new page before"
            checked={scenes.pageBefore}
            disabled={!titled}
            onChange={(event) => onCompile({ ...compile, scenes: { ...scenes, pageBefore: event.currentTarget.checked } })}
          />
          New page before
        </label>
        <label className="preference">
          <input
            type="checkbox"
            aria-label="Scenes new page after"
            checked={scenes.pageAfter}
            disabled={!titled}
            onChange={(event) => onCompile({ ...compile, scenes: { ...scenes, pageAfter: event.currentTarget.checked } })}
          />
          New page after
        </label>
      </div>
      <div className="structure-span">
        <Choice
          label="Separator"
          value={compile.sceneBreak}
          options={sceneBreaks.map((id) => ({ id, label: breakChoice[id] }))}
          onChange={(sceneBreak) => onCompile({ ...compile, sceneBreak })}
        />
      </div>
    </div>
  );
}

function HeadingFields({
  scope,
  heading,
  hint,
  titleLabel,
  disabled,
  pagesDisabled,
  onChange,
}: {
  scope: string;
  heading: CompileHeading;
  hint: string;
  titleLabel: string;
  disabled: boolean;
  pagesDisabled: boolean;
  onChange: (patch: Partial<CompileHeading>) => void;
}) {
  const numbered = heading.number !== "none";
  const both = heading.title && numbered;
  return (
    <>
      <div className="structure-span">
        <Field
          label="Name"
          ariaLabel={`${scope} name`}
          value={heading.name}
          placeholder={hint}
          disabled={disabled}
          onChange={(name) => onChange({ name })}
        />
      </div>
      <label className="preference">
        <input
          type="checkbox"
          aria-label={titleLabel}
          checked={heading.title}
          disabled={disabled}
          onChange={(event) => onChange({ title: event.currentTarget.checked })}
        />
        {titleLabel}
      </label>
      <div className="structure-span">
        <Choice
          label="Number"
          ariaLabel={`${scope} number`}
          value={heading.number}
          disabled={disabled}
          options={numberOptions}
          onChange={(number) => onChange({ number })}
        />
      </div>
      <div className="structure-span">
        <Choice
          label="Between the number and the title"
          ariaLabel={`${scope} break`}
          value={heading.join}
          disabled={disabled || !both}
          options={joinOptions}
          onChange={(join) => onChange({ join })}
        />
      </div>
      {both && heading.join === "mark" ? (
        <div className="structure-span">
          <Field
            label="Character"
            ariaLabel={`${scope} character`}
            value={heading.mark}
            placeholder=": "
            onChange={(mark) => onChange({ mark })}
          />
        </div>
      ) : null}
      <FontMenu
        label="Heading font"
        ariaLabel={`${scope} heading font`}
        value={heading.nameFont}
        inherit
        disabled={disabled || !numbered}
        onChange={(nameFont) => onChange({ nameFont })}
      />
      <Field
        label="Heading size"
        ariaLabel={`${scope} heading size`}
        value={heading.namePoints > 0 ? String(heading.namePoints) : ""}
        placeholder="Manuscript size"
        disabled={disabled || !numbered}
        onChange={(value) => onChange({ namePoints: pointSize(value) })}
      />
      <FontMenu
        label="Title font"
        ariaLabel={`${scope} title font`}
        value={heading.titleFont}
        inherit
        disabled={disabled || !heading.title}
        onChange={(titleFont) => onChange({ titleFont })}
      />
      <Field
        label="Title size"
        ariaLabel={`${scope} title size`}
        value={heading.titlePoints > 0 ? String(heading.titlePoints) : ""}
        placeholder="Manuscript size"
        disabled={disabled || !heading.title}
        onChange={(value) => onChange({ titlePoints: pointSize(value) })}
      />
      <div className="structure-span">
        <Choice
          label="Alignment"
          ariaLabel={`${scope} alignment`}
          value={heading.align}
          disabled={disabled}
          options={headingAlignments}
          onChange={(align) => onChange({ align })}
        />
      </div>
      <div className="structure-span structure-ticks">
        <label className="preference">
          <input
            type="checkbox"
            aria-label={`${scope} new page before`}
            checked={heading.pageBefore}
            disabled={pagesDisabled}
            onChange={(event) => onChange({ pageBefore: event.currentTarget.checked })}
          />
          New page before
        </label>
        <label className="preference">
          <input
            type="checkbox"
            aria-label={`${scope} new page after`}
            checked={heading.pageAfter}
            disabled={pagesDisabled}
            onChange={(event) => onChange({ pageAfter: event.currentTarget.checked })}
          />
          New page after
        </label>
      </div>
    </>
  );
}

function pointSize(value: string): number {
  if (value.trim() === "") {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function FontMenu({
  label,
  ariaLabel,
  value,
  onChange,
  disabled = false,
  inherit = false,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (font: string) => void;
  disabled?: boolean;
  inherit?: boolean;
}) {
  return (
    <label className="setting">
      <span className="setting-label">{label}</span>
      <FontChoice
        ariaLabel={ariaLabel}
        value={value}
        disabled={disabled}
        inherit={inherit}
        showFace
        onChange={onChange}
      />
    </label>
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
