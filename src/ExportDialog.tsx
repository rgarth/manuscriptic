import { useMemo, useState } from "react";
import { firstPreset, resolvedCompilePreferences, type CompilePreset } from "./bookCompile.ts";
import { buildCompile, type CompileDocument } from "./compileShape.ts";
import { readCompileIdentity } from "./compilePrefs.ts";
import { compileDocx } from "./docx.ts";
import { reportFailure } from "./failures.ts";
import { bookFileName, exportPath, readFilePreferences, readLastCompile, writeLastCompile } from "./filePrefs.ts";
import type { ProjectFile } from "./model/project.ts";
import { pickExportSave, resolveDirectory } from "./novelFile.ts";
import { compilePdf } from "./pdf.ts";
import { writeExport } from "./storage.ts";

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

const formats: {
  [Kind in ExportKind]: { label: string; extension: string; write: (doc: CompileDocument) => Uint8Array };
} = {
  docx: { label: "Word", extension: ".docx", write: compileDocx },
  pdf: { label: "PDF", extension: ".pdf", write: compilePdf },
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
  const [presetId, setPresetId] = useState(() => chosenPreset(project, filePath));
  const [kind, setKind] = useState<ExportKind>(() => readLastCompile(localStorage, filePath)?.kind ?? "docx");
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
    const bytes = format.write(compiled);
    writeLastCompile(localStorage, filePath, { presetId: preset.id, kind });
    setBusy(true);
    try {
      const directory = await resolveDirectory(readFilePreferences(localStorage).directory);
      const fileName = bookFileName(project.title).replace(/\.manuscriptic$/i, format.extension);
      const picked = await pickExportSave(directory, fileName, kind);
      if (!picked) {
        return;
      }
      await writeExport(exportPath(picked, format.extension), bytes);
      onClose();
    } catch (error: unknown) {
      reportFailure(error, "Could not write the compiled file.");
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
          {compiled && compiled.missing.length > 0 ? (
            <p className="compile-blank">{emptyTokens(compiled.missing)}</p>
          ) : null}
          <div className="dialog-actions">
            <button type="button" onClick={() => void compile()} disabled={busy}>
              Compile
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
