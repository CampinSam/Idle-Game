import { useAppSelector } from '../../store';
import './Profile.css';

function getInitials(username?: string | null, email?: string | null): string {
  const name = username || email || '?';
  return name.slice(0, 2).toUpperCase();
}

export default function ProfilePage() {
  const player = useAppSelector((s) => s.auth.player);

  const memberSince = player?.createdAt
    ? new Date(player.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="profile-page page-transition-wrapper">
      <div className="profile-wrapper-card">

        <div className="profile-banner">
          <div className="profile-avatar">
            {getInitials(player?.username, player?.email)}
          </div>
          <div className="profile-banner-info">
            <div className="profile-username">{player?.username || player?.email || 'Keeper'}</div>
            <div className="profile-banner-meta">
              {player?.keeperLevel != null && (
                <span className="profile-keeper-badge">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  Lv {player.keeperLevel}
                </span>
              )}
              {memberSince && (
                <span className="profile-since">Since {memberSince}</span>
              )}
            </div>
          </div>
        </div>

        <div className="profile-tab-content">
          <div className="profile-field">
            <span className="profile-field-label">Username</span>
            <span className="profile-field-value">{player?.username || '—'}</span>
          </div>
          <div className="profile-field">
            <span className="profile-field-label">Email</span>
            <span className="profile-field-value">{player?.email || '—'}</span>
          </div>
          <div className="profile-field">
            <span className="profile-field-label">Keeper Level</span>
            <span className="profile-field-value profile-highlight">{player?.keeperLevel ?? '—'}</span>
          </div>
          <div className="profile-field">
            <span className="profile-field-label">Member Since</span>
            <span className="profile-field-value">{memberSince || '—'}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
