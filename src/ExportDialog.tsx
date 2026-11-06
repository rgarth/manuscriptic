import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { firstPreset, resolvedCompilePreferences, type CompilePreset } from "./bookCompile.ts";
import { buildCompile, type CompileDocument } from "./compileShape.ts";
import { readCompileIdentity } from "./compilePrefs.ts";
import { loadCompileFonts } from "./compileFonts.ts";
import { compileDocx } from "./docx.ts";
import { failureMessage, reportFailure } from "./failures.ts";
import { bookFileName, exportPath, readDialogDirectory, readLastCompile, writeDialogDirectory, writeLastCompile } from "./filePrefs.ts";
import type { ProjectFile } from "./model/project.ts";
import { pickExportSave, resolveDirectory } from "./novelFile.ts";
import { compilePdf } from "./pdf.ts";
import { openCompiled, writeExport } from "./storage.ts";

type ExportKind = "docx" | "pdf";

const formatOrder: ExportKind[] = ["docx", "pdf"];

function chosenPreset(project: ProjectFile, filePath: string | null): string {
  const remembered = readLastCompile(localStorage, filePath)?.presetId;
  const found = project.compile.presets.find((item) => item.id === remembered);
  return found?.id ?? firstPreset(project.compile).id;
}

function exportKind(value: string): ExportKind | null {
  switch (value) {
    case "docx":
    case "pdf":
      return value;
    default:
      return null;
  }
}

async function compiledBytes(kind: ExportKind, doc: CompileDocument): Promise<Uint8Array> {
  switch (kind) {
    case "docx":
      return compileDocx(doc);
    case "pdf":
      return compilePdf(doc, await loadCompileFonts(doc));
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

const formats: {
  [Kind in ExportKind]: { label: string; extension: string };
} = {
  docx: { label: "Word", extension: ".docx" },
  pdf: { label: "PDF", extension: ".pdf" },
};

export default function ExportDialog({
  project,
  filePath,
  onClose,
}: {
  project: ProjectFile;
  filePath: string | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(() => chosenPreset(project, filePath));
  const [kind, setKind] = useState<ExportKind>(() => readLastCompile(localStorage, filePath)?.kind ?? "docx");
  const [openAfter, setOpenAfter] = useState(() => readLastCompile(localStorage, filePath)?.open ?? false);
  const preset = project.compile.presets.find((item) => item.id === presetId) ?? firstPreset(project.compile);
  const format = formats[kind];
  const compiled = useMemo(() => {
    try {
      return compileDocument(project, preset);
    } catch {
      return null;
    }
  }, [project, preset]);

  async function compile() {
    if (!compiled) {
      reportFailure("Author information could not be read.", "Author information could not be read.");
      return;
    }
    if (!compiled.hasDocument) {
      reportFailure("Nothing is selected, so nothing was written.", "Nothing is selected, so nothing was written.");
      return;
    }
    flushSync(() => {
      setFailure(null);
      setBusy(true);
    });
    try {
      const bytes = await compiledBytes(kind, compiled);
      writeLastCompile(localStorage, filePath, { presetId: preset.id, kind, open: openAfter });
      const directory = await resolveDirectory(readDialogDirectory(localStorage, filePath));
      const fileName = bookFileName(project.title).replace(/\.manuscriptic$/i, format.extension);
      const picked = await pickExportSave(directory, fileName, kind);
      if (!picked) {
        return;
      }
      const written = exportPath(picked, format.extension);
      writeDialogDirectory(localStorage, filePath, written);
      await writeExport(written, bytes);
      if (openAfter) {
        try {
          await openCompiled(written);
        } catch (error: unknown) {
          reportFailure(error, "The file was written, but it could not be opened.");
        }
      }
      onClose();
    } catch (error: unknown) {
      const message = failureMessage(error, "Could not compile the file.");
      setFailure(message);
      reportFailure(message, message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog compile" role="dialog" aria-modal="true" aria-label="Compile">
        <header className="settings-bar">
          <h2>Compile</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="compile-body">
          <div className="compile-choices">
            <label className="compile-choice-label">
              Compile
              <select value={preset.id} onChange={(event) => setPresetId(event.currentTarget.value)}>
                {project.compile.presets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="compile-choice-label">
              Format
              <select
                value={kind}
                onChange={(event) => {
                  const next = exportKind(event.currentTarget.value);
                  if (next) {
                    setKind(next);
                  }
                }}
              >
                {formatOrder.map((id) => (
                  <option key={id} value={id}>
                    {formats[id].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {failure ? (
            <p className="compile-blank" role="alert">
              {failure}
            </p>
          ) : null}
          {compiled && compiled.missing.length > 0 ? (
            <p className="compile-blank">{emptyTokens(compiled.missing)}</p>
          ) : null}
          <div className="dialog-actions">
            <label className="compile-open">
              <input
                type="checkbox"
                checked={openAfter}
                onChange={(event) => setOpenAfter(event.currentTarget.checked)}
              />
              Open when compiled
            </label>
            <button type="button" onClick={() => void compile()} disabled={busy}>
              {busy ? "Compiling…" : "Compile"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function emptyTokens(names: readonly string[]): string {
  const tokens = names.map((name) => `{$${name}}`);
  if (tokens.length === 1) {
    return `The manuscript contains ${tokens[0]}, which is empty.`;
  }
  const list =
    tokens.length === 2
      ? `${tokens[0]} and ${tokens[1]}`
      : `${tokens.slice(0, -1).join(", ")}, and ${tokens[tokens.length - 1]}`;
  return `The manuscript contains ${list}, which are empty.`;
}

function compileDocument(project: ProjectFile, preset: CompilePreset): CompileDocument {
  const preferences = resolvedCompilePreferences(project.compile, readCompileIdentity(localStorage), preset);
  return buildCompile(project, preset, preferences, new Date().getFullYear());
}
