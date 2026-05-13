import type { CharacterEvent } from '@derp/shared';

interface CharacterEventsBlockProps {
  items: CharacterEvent[];
}

function eventIcon(event: CharacterEvent): string {
  switch (event.type) {
    case 'level_up': return '⬆';
    case 'injured':  return '🤕';
    default:         return '•';
  }
}

function eventLabel(event: CharacterEvent): string {
  switch (event.type) {
    case 'level_up': return `${event.entityName} leveled up to level ${event.newLevel}!`;
    case 'injured':  return `${event.entityName} became injured.`;
    default:         return '';
  }
}

export default function CharacterEventsBlock({ items }: CharacterEventsBlockProps) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="gm-section-title">Character Events</div>
      {items.map((event, idx) => (
        <div
          key={idx}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[13px]"
        >
          <span className="text-base leading-none flex-shrink-0">{eventIcon(event)}</span>
          <span className="text-text-primary">{eventLabel(event)}</span>
        </div>
      ))}
    </div>
  );
}
