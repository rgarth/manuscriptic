import type { CompilePreset } from "./bookCompile.ts";

export default function CompilePresets({
  presets,
  selectedId,
  onSelect,
  onRename,
  onAdd,
  onDelete,
}: {
  presets: readonly CompilePreset[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRename: (name: string) => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const selected = presets.find((item) => item.id === selectedId);
  return (
    <div className="compile-presets">
      <label className="compile-preset-name">
        Compile
        <select aria-label="Compile" value={selectedId} onChange={(event) => onSelect(event.currentTarget.value)}>
          {presets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="compile-preset-name">
        Name
        <input
          aria-label="Compile name"
          value={selected?.name ?? ""}
          onChange={(event) => onRename(event.currentTarget.value)}
          onBlur={(event) => {
            if (event.currentTarget.value.trim() === "") {
              onRename("Untitled");
            }
          }}
        />
      </label>
      <div className="compile-preset-actions">
        <button type="button" onClick={onAdd}>
          New
        </button>
        <button type="button" onClick={onDelete} disabled={presets.length < 2}>
          Delete
        </button>
      </div>
      <p className="compile-preset-note">
        Manuscriptic supports templates for different compile targets. Each template keeps its own contents, structure and formatting.
      </p>
    </div>
  );
}
