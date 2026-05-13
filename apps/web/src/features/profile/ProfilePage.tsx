import { useAppSelector } from '../../store';

function getInitials(username?: string | null, email?: string | null): string {
  const name = username || email || '?';
  return name.slice(0, 2).toUpperCase();
}

const CARD_CLASS =
  'flex flex-col flex-1 min-h-0 ' +
  'overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] overscroll-contain';

const FIELD_LABEL_CLASS =
  'text-[12px] text-text-secondary font-semibold tracking-[0.3px] uppercase';

const FIELD_VALUE_CLASS =
  'text-[14px] text-text-primary font-medium text-right max-w-[60%] overflow-hidden text-ellipsis whitespace-nowrap';

export default function ProfilePage() {
  const player = useAppSelector((s) => s.auth.player);

  const memberSince = player?.createdAt
    ? new Date(player.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className={CARD_CLASS}>

        <div className="flex items-center gap-4 pt-5 pb-[18px] px-5 bg-gradient-to-b from-[rgba(139,92,246,0.1)] to-transparent border-b border-[rgba(139,92,246,0.15)]">
          <div className="w-[52px] h-[52px] shrink-0 rounded-full bg-gradient-to-br from-[#6D28D9] to-[#4C1D95] flex items-center justify-center font-['Cinzel',serif] text-[18px] font-bold text-[#e2d9ff] tracking-[0.04em] shadow-[0_0_0_2px_rgba(139,92,246,0.4),0_0_16px_rgba(139,92,246,0.2)]">
            {getInitials(player?.username, player?.email)}
          </div>
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="font-['Cinzel',serif] text-[18px] font-bold text-[#e2d9ff] tracking-[0.04em] truncate">
              {player?.username || player?.email || 'Keeper'}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {player?.keeperLevel != null && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.6px] uppercase text-[#fbbf24] bg-[rgba(251,191,36,0.1)] border border-[rgba(251,191,36,0.28)] px-2 py-0.5 rounded-[5px]">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  Lv {player.keeperLevel}
                </span>
              )}
              {memberSince && (
                <span className="text-[11px] text-text-secondary">Since {memberSince}</span>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 pt-1 pb-5">
          <div className="flex justify-between items-center py-[13px] border-b border-[rgba(139,92,246,0.1)]">
            <span className={FIELD_LABEL_CLASS}>Username</span>
            <span className={FIELD_VALUE_CLASS}>{player?.username || '—'}</span>
          </div>
          <div className="flex justify-between items-center py-[13px] border-b border-[rgba(139,92,246,0.1)]">
            <span className={FIELD_LABEL_CLASS}>Email</span>
            <span className={FIELD_VALUE_CLASS}>{player?.email || '—'}</span>
          </div>
          <div className="flex justify-between items-center py-[13px] border-b border-[rgba(139,92,246,0.1)]">
            <span className={FIELD_LABEL_CLASS}>Keeper Level</span>
            <span className="text-[14px] text-[#c4b5fd] font-bold text-right max-w-[60%] overflow-hidden text-ellipsis whitespace-nowrap">
              {player?.keeperLevel ?? '—'}
            </span>
          </div>
          <div className="flex justify-between items-center py-[13px]">
            <span className={FIELD_LABEL_CLASS}>Member Since</span>
            <span className={FIELD_VALUE_CLASS}>{memberSince || '—'}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
