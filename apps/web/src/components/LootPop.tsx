import { useEffect, useState, type ReactNode } from 'react';
import './LootPop.css';

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
    <div className="loot-pop-container" style={{ animationDuration: `${durationMs}ms` }}>
      {items.map((item) => (
        <span key={item.key} className="loot-pop-pill">
          {item.icon && <span className="loot-pop-icon">{item.icon}</span>}
          {item.label}
        </span>
      ))}
    </div>
  );
}
