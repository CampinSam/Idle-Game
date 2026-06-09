import { useState, useEffect, useCallback, useRef } from 'react';
import { useInterval } from '../../hooks/useNow';
import {
  LayoutDashboard, FileText, CheckSquare, Users, Radio,
  Coins, Settings, HeadphonesIcon, Shield, ChevronLeft,
  ChevronRight, LogOut, Layers, ChevronDown, UserCog, KeyRound, X, BarChart2, AlertTriangle, Database,
} from 'lucide-react';
import {
  adminApi, getAdminToken, setAdminToken, clearAdminToken,
  type AdminMe,
} from '../admin/adminApi';
import { CONTENT_TABLE_SUBS } from '../admin/smart/tableSchemas';
import AdminV2Dashboard from './sections/AdminV2Dashboard';
import AdminV2ContentSection from './sections/AdminV2ContentSection';
import AdminV2ApprovalsSection from './sections/AdminV2ApprovalsSection';
import AdminV2PlayersSection from './sections/AdminV2PlayersSection';
import AdminV2EconomySection from './sections/AdminV2EconomySection';
import AdminV2SystemSection, { SYSTEM_TOOLS, type SystemTool } from './sections/AdminV2SystemSection';
import AdminV2AccountsSection from './sections/AdminV2AccountsSection';
import AdminV2MetricsSection from './sections/AdminV2MetricsSection';
import AdminV2StubSection from './sections/AdminV2StubSection';
import AdminV2InstancesSection from './sections/AdminV2InstancesSection';
import AdminV2LiveOpsSection from './sections/AdminV2LiveOpsSection';

type Section =
  | 'dashboard'
  | 'metrics'
  | 'content'
  | 'approvals'
  | 'players'
  | 'instances'
  | 'live-ops'
  | 'economy'
  | 'system'
  | 'accounts'
  | 'support'
  | 'moderation';

const CONTENT_SUBS = CONTENT_TABLE_SUBS.map((t, idx) => ({
  key: t.apiKey,
  label: t.label,
  groupLabel: idx === 0 || CONTENT_TABLE_SUBS[idx - 1].group !== t.group ? t.group : undefined,
}));

const SESSION_KEY = 'adminV2Section';

function readPersistedNav(): { section: Section; sub: string | null } | null {
  try {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const [section, sub = null] = hash.split('/');
      const valid: Section[] = ['dashboard','metrics','content','approvals','players','instances','live-ops','economy','system','support','moderation'];
      if (valid.includes(section as Section)) {
        return { section: section as Section, sub };
      }
    }
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as { section: Section; sub: string | null };
  } catch {
    // ignore corrupt storage
  }
  return null;
}

function persistNav(section: Section, sub: string | null) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ section, sub }));
    const hash = sub ? `${section}/${sub}` : section;
    history.replaceState(null, '', `#${hash}`);
  } catch {
    // ignore storage errors
  }
}

function clearPersistedNav() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    history.replaceState(null, '', window.location.pathname);
  } catch {
    // ignore
  }
}

interface NavSub {
  key: string;
  label: string;
  groupLabel?: string;
}

interface NavItem {
  key: Section;
  label: string;
  icon: React.ReactNode;
  stub?: boolean;
  requirePerm?: keyof AdminMe['role']['permissionFlags'];
  requireSuperAdmin?: boolean;
  subs?: NavSub[];
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> },
  { key: 'metrics', label: 'Metrics', icon: <BarChart2 size={15} />, requirePerm: 'metrics_read' },
  {
    key: 'content',
    label: 'Content',
    icon: <FileText size={15} />,
    requirePerm: 'read',
    subs: CONTENT_SUBS,
  },
  { key: 'approvals', label: 'Approvals', icon: <CheckSquare size={15} />, requirePerm: 'approve' },
  { key: 'players', label: 'Players', icon: <Users size={15} />, requirePerm: 'player_read' },
  { key: 'instances', label: 'Instances', icon: <Database size={15} />, requirePerm: 'player_read' },
  { key: 'economy', label: 'Economy', icon: <Coins size={15} />, requirePerm: 'system_tools' },
  {
    key: 'system',
    label: 'System',
    icon: <Settings size={15} />,
    requirePerm: 'system_tools',
    subs: SYSTEM_TOOLS.map(t => ({ key: t.key, label: t.label })),
  },
  { key: 'accounts', label: 'Accounts', icon: <UserCog size={15} />, requireSuperAdmin: true },
  { key: 'live-ops', label: 'Live Ops', icon: <Radio size={15} />, requirePerm: 'system_tools' },
  { key: 'support', label: 'Support', icon: <HeadphonesIcon size={15} />, stub: true },
  { key: 'moderation', label: 'Moderation', icon: <Shield size={15} />, stub: true },
];

function effectivePerms(me: AdminMe): AdminMe['role']['permissionFlags'] {
  return me.effectivePermissions ?? me.role.permissionFlags;
}

function isVisible(item: NavItem, me: AdminMe): boolean {
  if (item.stub) return true;
  if (item.requireSuperAdmin) {
    return me.role.slug === 'super_admin' || !!me.isBootstrap;
  }
  if (item.requirePerm) {
    const isSuperAdmin = me.role.slug === 'super_admin' || !!me.isBootstrap;
    return isSuperAdmin || effectivePerms(me)[item.requirePerm] === true;
  }
  return true;
}

function ChangePasswordModal({ me, onClose }: { me: AdminMe; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { setError('Passwords do not match'); return; }
    if (next.length < 8) { setError('New password must be at least 8 characters'); return; }
    setSaving(true);
    setError(null);
    try {
      await adminApi.changeOwnPassword(current, next);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.65)] flex items-center justify-center z-[1000]" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#0d0e1f] border border-[#1a1b35] rounded-[12px] p-6 w-[380px] max-w-[calc(100vw-32px)] shadow-[0_12px_48px_rgba(0,0,0,0.7)]">
        <div className="flex items-center justify-between text-[15px] font-bold text-[#d4d4f0] mb-5">
          <span>Change Password</span>
          <button className="flex items-center justify-center p-1 bg-transparent border-0 cursor-pointer text-[#4a4a7a] rounded hover:text-[#c0c0e8] transition-colors" onClick={onClose}><X size={14} /></button>
        </div>
        {success ? (
          <div style={{ padding: '24px 0 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
            <div style={{ color: '#34d399', fontWeight: 700, marginBottom: 4 }}>Password changed successfully</div>
            <div style={{ color: '#4a4a7a', fontSize: 12, marginBottom: 20 }}>Your new password is active.</div>
            <button className="py-[7px] px-4 bg-[#6c63ff] border-0 rounded-[8px] text-white text-[13px] font-semibold cursor-pointer transition-colors duration-[120ms] whitespace-nowrap hover:bg-[#5a52d5] disabled:opacity-50 disabled:cursor-not-allowed" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {me.isBootstrap && (
              <div className="py-2 px-3 rounded-[6px] text-[12px] mb-4 bg-[rgba(220,38,38,0.1)] border border-[rgba(220,38,38,0.25)] text-[#f87171]">
                Bootstrap accounts cannot change their password via the panel.
              </div>
            )}
            <label className="block text-[11px] font-semibold text-[#6060a0] tracking-[0.05em] uppercase mt-0 mb-1">Current password</label>
            <input
              className="block w-full py-2 px-3 bg-[#080918] border border-[#1a1b35] rounded-[8px] text-[#d4d4f0] text-[13px] box-border transition-[border-color] duration-[150ms] mb-4 focus:outline-none focus:border-[#6c63ff] disabled:opacity-45 disabled:cursor-not-allowed"
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              autoFocus
              disabled={me.isBootstrap}
            />
            <label className="block text-[11px] font-semibold text-[#6060a0] tracking-[0.05em] uppercase my-3 mb-1">New password</label>
            <input
              className="block w-full py-2 px-3 bg-[#080918] border border-[#1a1b35] rounded-[8px] text-[#d4d4f0] text-[13px] box-border transition-[border-color] duration-[150ms] mb-4 focus:outline-none focus:border-[#6c63ff] disabled:opacity-45 disabled:cursor-not-allowed"
              type="password"
              value={next}
              onChange={e => setNext(e.target.value)}
              disabled={me.isBootstrap}
            />
            <label className="block text-[11px] font-semibold text-[#6060a0] tracking-[0.05em] uppercase my-3 mb-1">Confirm new password</label>
            <input
              className="block w-full py-2 px-3 bg-[#080918] border border-[#1a1b35] rounded-[8px] text-[#d4d4f0] text-[13px] box-border transition-[border-color] duration-[150ms] mb-4 focus:outline-none focus:border-[#6c63ff] disabled:opacity-45 disabled:cursor-not-allowed"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              disabled={me.isBootstrap}
            />
            {error && <div className="py-2 px-3 rounded-[6px] text-[12px] mt-2 bg-[rgba(220,38,38,0.1)] border border-[rgba(220,38,38,0.25)] text-[#f87171]">{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="submit"
                className="py-[7px] px-4 bg-[#6c63ff] border-0 rounded-[8px] text-white text-[13px] font-semibold cursor-pointer transition-colors duration-[120ms] whitespace-nowrap hover:bg-[#5a52d5] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={saving || me.isBootstrap || !current || !next || !confirm}
              >
                {saving ? 'Saving…' : 'Change Password'}
              </button>
              <button
                type="button"
                className="py-[7px] px-4 bg-transparent border border-[#1a1b35] rounded-[8px] text-[#6060a0] text-[13px] font-semibold cursor-pointer transition-[border-color,color] duration-[120ms] whitespace-nowrap hover:border-[#3a3a6a] hover:text-[#a0a0c8]"
                onClick={onClose}
              >Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const IS_DEV = (import.meta as any).env?.DEV;
const DEV_USERNAME = 'superadmin';
const DEV_PASSWORD = 'admin';

function AdminV2Login({ onLogin }: { onLogin: (me: AdminMe) => void }) {
  const [username, setUsername] = useState(IS_DEV ? DEV_USERNAME : '');
  const [password, setPassword] = useState(IS_DEV ? DEV_PASSWORD : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const autoLoginDone = useRef(false);

  const doLogin = async (u: string, p: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await adminApi.login(u.trim(), p);
      setAdminToken(result.token);
      onLogin(result.account);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (IS_DEV && !autoLoginDone.current) {
      autoLoginDone.current = true;
      doLogin(DEV_USERNAME, DEV_PASSWORD);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    await doLogin(username, password);
  };

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[#08091a]">
      <form className="bg-[#0d0e1f] border border-[#1a1b35] rounded-[14px] p-10 w-[360px] shadow-[0_8px_40px_rgba(0,0,0,0.5)]" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div
            className="w-6 h-6 rounded-[6px] flex-shrink-0 flex items-center justify-center text-[12px] font-[800] text-white"
            style={{ backgroundImage: 'linear-gradient(135deg,#6c63ff,#a855f7)' }}
          >
            <Layers size={14} />
          </div>
          <div>
            <div className="text-[1.4rem] font-[800] text-[#e0e0ff] m-0 mb-1">Admin Panel</div>
            <div className="text-[12px] text-[#4a4a7a] m-0">Derp Universe · v2</div>
          </div>
        </div>

        <label className="block text-[11px] font-semibold text-[#6060a0] tracking-[0.05em] uppercase mb-1">Username</label>
        <input
          type="text"
          className="w-full py-[0.65rem] px-[0.85rem] border border-[#1a1b35] rounded-[8px] bg-[#080918] text-[#d4d4f0] text-[14px] box-border transition-[border-color] duration-[150ms] mb-4 focus:outline-none focus:border-[#6c63ff]"
          placeholder="admin"
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        <label className="block text-[11px] font-semibold text-[#6060a0] tracking-[0.05em] uppercase mb-1">Password</label>
        <input
          type="password"
          className="w-full py-[0.65rem] px-[0.85rem] border border-[#1a1b35] rounded-[8px] bg-[#080918] text-[#d4d4f0] text-[14px] box-border transition-[border-color] duration-[150ms] mb-4 focus:outline-none focus:border-[#6c63ff]"
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button
          type="submit"
          className="w-full py-[0.7rem] bg-[#6c63ff] text-white border-0 rounded-[8px] text-[14px] font-bold cursor-pointer transition-colors duration-[150ms] mt-1 hover:bg-[#5a52d5] disabled:opacity-55 disabled:cursor-not-allowed"
          disabled={loading || !username.trim() || !password}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        {error && <div className="text-[#ff6b6b] text-[12px] mt-2">{error}</div>}
      </form>
    </div>
  );
}

function Sidebar({
  me,
  collapsed,
  activeSection,
  activeSub,
  onCollapse,
  onNavigate,
  onLogout,
  keyPending,
}: {
  me: AdminMe;
  collapsed: boolean;
  activeSection: Section;
  activeSub: string | null;
  onCollapse: () => void;
  onNavigate: (s: Section, sub?: string) => void;
  onLogout: () => void;
  keyPending: boolean;
}) {
  const visibleItems = NAV_ITEMS.filter(item => isVisible(item, me));

  return (
    <div className={`flex flex-col bg-[#0d0e1f] border-r border-[#1a1b35] transition-[width] duration-200 overflow-hidden flex-shrink-0 ${collapsed ? 'w-[48px]' : 'w-[220px]'}`}>
      <div className={`flex items-center border-b border-[#1a1b35] flex-shrink-0 min-h-[52px] ${collapsed ? 'justify-center py-[14px]' : 'gap-[10px] px-3 py-[14px]'}`}>
        {!collapsed && (
          <div
            className="w-6 h-6 rounded-[6px] flex-shrink-0 flex items-center justify-center text-[12px] font-[800] text-white"
            style={{ backgroundImage: 'linear-gradient(135deg,#6c63ff,#a855f7)' }}
          >
            <Layers size={14} />
          </div>
        )}
        {!collapsed && <span className="text-[13px] font-bold text-[#e0e0ff] whitespace-nowrap overflow-hidden flex-1">Admin v2</span>}
        <button
          className={`flex-shrink-0 flex items-center justify-center bg-transparent border-0 cursor-pointer text-[#4a4a7a] rounded-[6px] p-[4px_6px] transition-[background,color] duration-[120ms] hover:bg-[#1a1b35] hover:text-[#8080b0] ${!collapsed ? 'ml-auto' : ''}`}
          onClick={onCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto touch-pan-y overflow-x-hidden py-[6px]">
        {visibleItems.map(item => {
          const isActive = activeSection === item.key;
          const hasSubs = !collapsed && !item.stub && isActive && item.subs && item.subs.length > 0;
          const showWarnDot = keyPending && item.key === 'system';

          return (
            <div key={item.key} className="mb-[2px]">
              <button
                className={`flex items-center gap-[10px] px-3 py-[7px] cursor-pointer border-0 w-[calc(100%-8px)] text-left text-[13px] rounded-[6px] mx-[4px] my-[1px] whitespace-nowrap transition-[background,color] duration-[120ms] relative hover:bg-[#1a1b35] hover:text-[#c0c0e8] ${
                  isActive ? 'bg-[rgba(108,99,255,0.18)] text-[#a89fff]' : 'bg-transparent text-[#7a7aaa]'
                }`}
                onClick={() => onNavigate(item.key)}
                title={collapsed ? (showWarnDot ? `${item.label} — key pending!` : item.label) : undefined}
              >
                <span className={`flex-shrink-0 ${isActive ? 'opacity-100' : 'opacity-75'}`}>{item.icon}</span>
                {!collapsed && (
                  <>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.label}
                    </span>
                    {item.stub && (
                      <span className="text-[9px] font-bold tracking-[0.05em] bg-[rgba(107,114,128,0.2)] text-[#6b7280] border border-[rgba(107,114,128,0.3)] py-[1px] px-[5px] rounded-[3px] ml-auto flex-shrink-0">SOON</span>
                    )}
                    {showWarnDot && (
                      <span className="w-[7px] h-[7px] rounded-full bg-[#fbbf24] flex-shrink-0 shadow-[0_0_5px_rgba(251,191,36,0.7)] animate-[av2-pulse-warn_1.8s_ease-in-out_infinite]" />
                    )}
                    {item.subs && !item.stub && (
                      <ChevronDown
                        size={11}
                        style={{
                          flexShrink: 0,
                          opacity: 0.5,
                          transform: isActive ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.15s',
                        }}
                      />
                    )}
                  </>
                )}
                {collapsed && showWarnDot && (
                  <span className="w-[7px] h-[7px] rounded-full bg-[#fbbf24] flex-shrink-0 shadow-[0_0_5px_rgba(251,191,36,0.7)] animate-[av2-pulse-warn_1.8s_ease-in-out_infinite]" style={{ position: 'absolute', top: 6, right: 6 }} />
                )}
              </button>

              {hasSubs && (
                <div className="overflow-hidden">
                  {item.subs!.map(sub => (
                    <div key={sub.key}>
                      {sub.groupLabel && (
                        <div className="px-[30px] pt-[10px] pb-[2px] text-[9px] font-bold uppercase tracking-[0.1em] text-[#3a3a5a] select-none">
                          {sub.groupLabel}
                        </div>
                      )}
                      <button
                        className={`flex items-center gap-[10px] text-[12px] px-3 py-[5px] pl-[30px] cursor-pointer border-0 w-[calc(100%-8px)] text-left rounded-[6px] mx-[4px] my-[1px] whitespace-nowrap transition-[background,color] duration-[120ms] ${
                          activeSub === sub.key
                            ? 'bg-[rgba(108,99,255,0.12)] text-[#9090d8]'
                            : 'bg-transparent text-[#5a5a8a] hover:bg-[#1a1b35] hover:text-[#c0c0e8]'
                        }`}
                        onClick={() => onNavigate(item.key, sub.key)}
                      >
                        {sub.label}
                        {keyPending && sub.key === 'crypto' && (
                          <span className="w-[7px] h-[7px] rounded-full bg-[#fbbf24] flex-shrink-0 shadow-[0_0_5px_rgba(251,191,36,0.7)] animate-[av2-pulse-warn_1.8s_ease-in-out_infinite]" style={{ marginLeft: 6 }} />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-[#1a1b35] p-[8px_4px] flex-shrink-0">
        <button
          className="flex items-center gap-2 px-3 py-[6px] bg-transparent border-0 cursor-pointer text-[#4a4a7a] text-[12px] w-full rounded-[6px] transition-[background,color] duration-[120ms] whitespace-nowrap hover:bg-[#1a1b35] hover:text-[#8080b0]"
          onClick={onLogout}
          title="Sign out"
        >
          <LogOut size={13} style={{ flexShrink: 0 }} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );
}

function TopBar({
  me,
  activeSection,
  activeSub,
  onPasswordChange,
}: {
  me: AdminMe;
  activeSection: Section;
  activeSub: string | null;
  onPasswordChange: () => void;
}) {
  const labels: Record<Section, string> = {
    dashboard: 'Dashboard',
    metrics: 'Game Health Metrics',
    content: 'Content Editor',
    approvals: 'Approvals',
    players: 'Player Management',
    instances: 'World Instances',
    'live-ops': 'Live Ops',
    economy: 'Balance Simulator',
    system: 'System Tools',
    accounts: 'Account Management',
    support: 'Support',
    moderation: 'Moderation',
  };

  return (
    <div className="flex items-center gap-3 px-5 py-[10px] border-b border-[#1a1b35] bg-[#0a0b1c] flex-shrink-0 min-h-[48px]">
      <span className="text-[15px] font-bold text-[#d4d4f0]">{labels[activeSection]}</span>
      {activeSub && (
        <span className="text-[12px] text-[#4a4a7a]">
          / {CONTENT_SUBS.find(s => s.key === activeSub)?.label ?? activeSub}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-[12px] text-[#6060a0]">{me.username}</span>
        <span className="text-[10px] font-semibold tracking-[0.06em] bg-[rgba(108,99,255,0.15)] text-[#8080c8] border border-[rgba(108,99,255,0.25)] py-[2px] px-[6px] rounded">{me.role.name}</span>
        {!me.isBootstrap && (
          <button
            className="flex items-center justify-center p-[5px] bg-transparent border border-[#1a1b35] rounded-[6px] text-[#4a4a7a] cursor-pointer transition-[border-color,color] duration-[120ms] hover:border-[#6c63ff55] hover:text-[#a89fff]"
            onClick={onPasswordChange}
            title="Change password"
          >
            <KeyRound size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

const KEY_POLL_INTERVAL_MS = 5 * 60_000;

export default function AdminV2Shell() {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [checking, setChecking] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [keyPending, setKeyPending] = useState(false);
  const meRef = useRef<AdminMe | null>(null);

  const pollKeyPending = useCallback(async () => {
    const account = meRef.current;
    if (!account) return;
    const isSuperAdmin = account.role.slug === 'super_admin' || !!account.isBootstrap;
    const perms = account.effectivePermissions ?? account.role.permissionFlags;
    if (!isSuperAdmin && !perms.system_tools) return;
    try {
      const config = await adminApi.getCryptoConfig();
      setKeyPending(!!config?.hotWalletKeyPendingDownload);
    } catch {
      // silently ignore — this is a non-critical background check
    }
  }, []);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setChecking(false);
      return;
    }
    adminApi.getMe()
      .then(account => {
        meRef.current = account;
        setMe(account);
        const saved = readPersistedNav();
        if (saved) {
          setActiveSection(saved.section);
          setActiveSub(saved.sub);
          persistNav(saved.section, saved.sub);
        }
        pollKeyPending();
      })
      .catch(() => {
        clearAdminToken();
        clearPersistedNav();
      })
      .finally(() => setChecking(false));
  }, [pollKeyPending]);

  useInterval(pollKeyPending, KEY_POLL_INTERVAL_MS, !!me);

  const handleLogin = useCallback((account: AdminMe) => {
    meRef.current = account;
    setMe(account);
    const isSuperAdmin = account.role.slug === 'super_admin' || !!account.isBootstrap;
    const defaultSection: Section =
      isSuperAdmin || effectivePerms(account).metrics_read ? 'metrics' : 'dashboard';
    setActiveSection(defaultSection);
    setActiveSub(null);
    persistNav(defaultSection, null);
    pollKeyPending();
  }, [pollKeyPending]);

  const handleLogout = useCallback(() => {
    clearAdminToken();
    clearPersistedNav();
    meRef.current = null;
    setMe(null);
    setKeyPending(false);
    setActiveSection('dashboard');
    setActiveSub(null);
  }, []);

  const handleNavigate = useCallback((section: string, sub?: string) => {
    const s = section as Section;
    const sub_ = sub || null;
    setActiveSection(s);
    setActiveSub(sub_);
    persistNav(s, sub_);
  }, []);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#08091a]">
        <div style={{ color: '#3a3a6a', fontSize: 13 }}>Checking session…</div>
      </div>
    );
  }

  if (!me) {
    return <AdminV2Login onLogin={handleLogin} />;
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <AdminV2Dashboard me={me} onNavigate={handleNavigate} />;
      case 'metrics':
        return <AdminV2MetricsSection me={me} />;
      case 'content':
        return <AdminV2ContentSection me={me} activeTable={activeSub || undefined} />;
      case 'approvals':
        return <AdminV2ApprovalsSection me={me} />;
      case 'players':
        return <AdminV2PlayersSection me={me} />;
      case 'instances':
        return <AdminV2InstancesSection me={me} />;
      case 'economy':
        return <AdminV2EconomySection me={me} />;
      case 'system':
        return (
          <AdminV2SystemSection
            me={me}
            activeTool={(activeSub as SystemTool) || 'icons'}
            onToolChange={tool => setActiveSub(tool)}
          />
        );
      case 'accounts':
        return <AdminV2AccountsSection me={me} />;
      case 'live-ops':
        return <AdminV2LiveOpsSection />;
      case 'support':
        return (
          <AdminV2StubSection
            icon="🎧"
            title="Support Tools"
            description="Integrated support tooling for handling player tickets, appeals, and in-game issue resolution."
            plannedFeatures={[
              'Ticket queue with priority triage',
              'Player account lookup with full history',
              'Item restoration and currency adjustments',
              'Ban and mute management with audit trail',
              'Canned response templates',
            ]}
          />
        );
      case 'moderation':
        return (
          <AdminV2StubSection
            icon="🛡️"
            title="Moderation"
            description="Community moderation tools for maintaining a healthy in-game environment."
            plannedFeatures={[
              'Chat log search and review',
              'Player report queue',
              'Automated flag review workflow',
              'Sanction history and appeals',
              'Content moderation for user-generated names',
            ]}
          />
        );
      default:
        return null;
    }
  };

  const handleGoToCrypto = () => handleNavigate('system', 'crypto');

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#08091a] text-[#d4d4f0]">
      <Sidebar
        me={me}
        collapsed={collapsed}
        activeSection={activeSection}
        activeSub={activeSub}
        onCollapse={() => setCollapsed(c => !c)}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        keyPending={keyPending}
      />
      <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-hidden flex flex-col min-w-0">
        <TopBar
          me={me}
          activeSection={activeSection}
          activeSub={activeSub}
          onPasswordChange={() => setShowPasswordModal(true)}
        />
        {keyPending && (
          <button
            className="flex items-center gap-[10px] w-full py-[9px] px-5 bg-[rgba(251,191,36,0.1)] border-0 border-b border-[rgba(251,191,36,0.35)] text-[#fde68a] text-[12.5px] cursor-pointer text-left flex-shrink-0 transition-[background] duration-[150ms] hover:bg-[rgba(251,191,36,0.17)]"
            onClick={handleGoToCrypto}
            title="Click to go to Crypto config and download the private key"
          >
            <AlertTriangle size={14} style={{ color: '#fbbf24', flexShrink: 0 }} />
            <span>
              <strong>Action required:</strong> Hot wallet private key has not been downloaded.
              If the server restarts, it will be permanently lost.
            </span>
            <span className="ml-auto flex-shrink-0 font-bold text-[#fbbf24] text-[12px] whitespace-nowrap">Download now →</span>
          </button>
        )}
        <div className="flex-1 overflow-auto min-h-0">
          {renderSection()}
        </div>
      </div>
      {showPasswordModal && me && (
        <ChangePasswordModal me={me} onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  );
}
