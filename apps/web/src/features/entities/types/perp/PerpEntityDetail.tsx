import DefaultEntityDetail from '../_default/DefaultEntityDetail';
import type { EntityDetailProps } from '../../types';
import { isLeader } from './isLeader';
import { getFaction } from './getFaction';

const FACTION_LABELS: Record<string, string> = {
  genovault: 'GENOVAULT',
  astro_schism: 'ASTRO SCHISM',
  kraashers: 'KRAASHERS',
};

const FACTION_COLORS: Record<string, { text: string; dot: string; border: string; bg: string }> = {
  genovault: {
    text: '#c4b5fd',
    dot: '#a78bfa',
    border: 'rgba(139,92,246,0.4)',
    bg: 'linear-gradient(90deg,rgba(139,92,246,0.18),rgba(139,92,246,0.04))',
  },
  astro_schism: {
    text: '#7dd3fc',
    dot: '#38bdf8',
    border: 'rgba(56,189,248,0.4)',
    bg: 'linear-gradient(90deg,rgba(14,165,233,0.18),rgba(14,165,233,0.04))',
  },
  kraashers: {
    text: '#fca5a5',
    dot: '#f87171',
    border: 'rgba(239,68,68,0.4)',
    bg: 'linear-gradient(90deg,rgba(239,68,68,0.18),rgba(239,68,68,0.04))',
  },
};

const FACTION_BG_GRADIENT: Record<string, string> = {
  genovault: 'radial-gradient(circle at 50% 0%,rgba(139,92,246,0.18),transparent 65%)',
  astro_schism: 'radial-gradient(circle at 50% 0%,rgba(56,189,248,0.18),transparent 65%)',
  kraashers: 'radial-gradient(circle at 50% 0%,rgba(239,68,68,0.18),transparent 65%)',
};

export default function PerpEntityDetail(props: EntityDetailProps) {
  if (props.variant === 'lightweight') {
    return <DefaultEntityDetail {...props} />;
  }

  const leader = isLeader(props.entity);
  const faction = getFaction(props.entity);

  if (leader === 'multiverse_leader') {
    return (
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{ background: 'radial-gradient(circle at 50% 0%,rgba(253,224,71,0.22),transparent 55%),radial-gradient(circle at 80% 100%,rgba(139,92,246,0.18),transparent 55%)' }}
      >
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-extrabold tracking-[1.2px] uppercase shrink-0"
          style={{
            color: '#fde68a',
            borderBottom: '1px solid rgba(253,224,71,0.35)',
            background: 'linear-gradient(90deg,rgba(253,224,71,0.15),rgba(139,92,246,0.08))',
          }}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: '#fde68a', boxShadow: '0 0 8px rgba(253,224,71,0.9)' }}
            aria-hidden
          />
          MULTIVERSE LEADER
        </div>
        <DefaultEntityDetail {...props} />
      </div>
    );
  }

  if (leader === 'leader') {
    return (
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{ background: 'radial-gradient(circle at 50% 0%,rgba(253,224,71,0.14),transparent 60%)' }}
      >
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-extrabold tracking-[1.2px] uppercase shrink-0"
          style={{
            color: '#fcd34d',
            borderBottom: '1px solid rgba(253,211,77,0.3)',
            background: 'linear-gradient(90deg,rgba(253,211,77,0.12),transparent)',
          }}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: '#fcd34d', boxShadow: '0 0 6px rgba(253,211,77,0.75)' }}
            aria-hidden
          />
          LEADER
        </div>
        <DefaultEntityDetail {...props} />
      </div>
    );
  }

  if (faction) {
    const colors = FACTION_COLORS[faction];
    return (
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{ background: FACTION_BG_GRADIENT[faction] }}
      >
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-extrabold tracking-[1.2px] uppercase shrink-0"
          style={{
            color: colors.text,
            borderBottom: `1px solid ${colors.border}`,
            background: colors.bg,
          }}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: colors.dot, boxShadow: `0 0 6px ${colors.dot}` }}
            aria-hidden
          />
          {FACTION_LABELS[faction]}
        </div>
        <DefaultEntityDetail {...props} />
      </div>
    );
  }

  return <DefaultEntityDetail {...props} />;
}
