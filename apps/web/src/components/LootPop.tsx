import { CSSProperties, useEffect, useState, type ReactNode } from 'react';

export interface LootPopItem {
  key: string;
  icon?: ReactNode;
  label: string;
}

interface LootPopProps {
  items: LootPopItem[];
  durationMs?: number;
  onComplete?: () => void;
}

export default function LootPop({ items, durationMs = 1500, onComplete }: LootPopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (items.length === 0) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [items, durationMs, onComplete]);

  if (!visible || items.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 flex flex-wrap justify-center gap-1 pb-1.5 pointer-events-none [animation:lootPopFloat_var(--loot-pop-duration,1500ms)_ease-out_forwards]"
      style={{ '--loot-pop-duration': `${durationMs}ms` } as CSSProperties}
    >
      {items.map((item) => (
        <span
          key={item.key}
          className="text-[11px] font-bold text-[#d1fae5] bg-[rgba(6,78,59,0.88)] border border-[rgba(52,211,153,0.55)] px-2 py-[3px] rounded-md whitespace-nowrap inline-flex items-center gap-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
        >
          {item.icon && <span className="inline-flex items-center text-[13px]">{item.icon}</span>}
          {item.label}
        </span>
      ))}
    </div>
  );
}
