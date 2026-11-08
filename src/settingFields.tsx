import type { CompileFormat } from "./bookCompile.ts";
import { FontChoice } from "./FontChoice.tsx";

export function MarginFields({
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
      <Field label="Top" value={String(format.margins.top)} onChange={(value) => edge("top", value)} />
      <Field label="Right" value={String(format.margins.right)} onChange={(value) => edge("right", value)} />
      <Field label="Bottom" value={String(format.margins.bottom)} onChange={(value) => edge("bottom", value)} />
      <Field label="Left" value={String(format.margins.left)} onChange={(value) => edge("left", value)} />
    </div>
  );
}

export function FontMenu({
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
      <FontChoice ariaLabel={ariaLabel} value={value} disabled={disabled} inherit={inherit} onChange={onChange} />
    </label>
  );
}

export function Field({
  label,
  value,
  onChange,
  disabled = false,
  multiline = false,
  placeholder,
  ariaLabel,
  token,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  token?: string;
}) {
  const name = ariaLabel ?? label;
  return (
    <label className="setting">
      <span className="setting-label">
        <span>{label}</span>
        {token ? <span className="token">{token}</span> : null}
      </span>
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

export function Choice<Id extends string>({
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
            <button key={item.id} type="button" aria-pressed={item.id === value} disabled={disabled} onClick={() => onChange(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
