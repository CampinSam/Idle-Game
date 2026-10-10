export interface SelectConfig {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ key: string; label: string }>;
  width?: number;
}

export interface ListControlsProps {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  selects?: SelectConfig[];
  className?: string;
}

export function ListControls({ search, selects = [], className = '' }: ListControlsProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      {search && (
        <div className="flex-1 flex items-center gap-[7px] bg-[rgba(0,0,0,0.25)] border border-[rgba(139,92,246,0.18)] rounded-lg px-2.5 h-[34px] min-w-0 focus-within:border-[rgba(139,92,246,0.5)]">
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="text-text-secondary flex-shrink-0"
          >
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder={search.placeholder ?? 'Search…'}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            aria-label={search.placeholder ?? 'Search'}
            className="flex-1 bg-transparent border-none text-text-primary text-[12px] outline-none min-w-0 placeholder:text-text-secondary [font-family:'Exo_2',system-ui,sans-serif]"
          />
        </div>
      )}
      {selects.map((s, i) => (
        <select
          key={i}
          className="list-controls__select"
          style={s.width !== undefined ? { width: s.width } : undefined}
          value={s.value}
          onChange={(e) => s.onChange(e.target.value)}
          aria-label={s.label}
        >
          {s.options.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      ))}
    </div>
  );
}
