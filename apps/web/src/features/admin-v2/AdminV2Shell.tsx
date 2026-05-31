import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, FileText, CheckSquare, Users, Radio,
  Coins, Settings, HeadphonesIcon, Shield, ChevronLeft,
  ChevronRight, LogOut, Layers, ChevronDown,
} from 'lucide-react';
import {
  adminApi, getAdminToken, setAdminToken, clearAdminToken,
  type AdminMe,
} from '../admin/adminApi';
import { TABLE_GROUPS } from '../admin/smart/tableSchemas';
import AdminV2Dashboard from './sections/AdminV2Dashboard';
import AdminV2ContentSection from './sections/AdminV2ContentSection';
import AdminV2ApprovalsSection from './sections/AdminV2ApprovalsSection';
import AdminV2PlayersSection from './sections/AdminV2PlayersSection';
import AdminV2EconomySection from './sections/AdminV2EconomySection';
import AdminV2SystemSection, { SYSTEM_TOOLS, type SystemTool } from './sections/AdminV2SystemSection';
import AdminV2StubSection from './sections/AdminV2StubSection';
import './admin-v2.css';

type Section =
  | 'dashboard'
  | 'content'
  | 'approvals'
  | 'players'
  | 'live-ops'
  | 'economy'
  | 'system'
  | 'support'
  | 'moderation';

const CONTENT_SUBS = Object.keys(TABLE_GROUPS);

interface NavSub {
  key: string;
  label: string;
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
  {
    key: 'content',
    label: 'Content',
    icon: <FileText size={15} />,
    requirePerm: 'read',
    subs: CONTENT_SUBS.map(g => ({ key: g, label: g })),
  },
  { key: 'approvals', label: 'Approvals', icon: <CheckSquare size={15} />, requirePerm: 'approve' },
  { key: 'players', label: 'Players', icon: <Users size={15} />, requirePerm: 'player_read' },
  { key: 'economy', label: 'Economy', icon: <Coins size={15} />, requirePerm: 'system_tools' },
  {
    key: 'system',
    label: 'System',
    icon: <Settings size={15} />,
    requirePerm: 'system_tools',
    subs: SYSTEM_TOOLS.map(t => ({ key: t.key, label: t.label })),
  },
  { key: 'live-ops', label: 'Live Ops', icon: <Radio size={15} />, stub: true },
  { key: 'support', label: 'Support', icon: <HeadphonesIcon size={15} />, stub: true },
  { key: 'moderation', label: 'Moderation', icon: <Shield size={15} />, stub: true },
];

function isVisible(item: NavItem, me: AdminMe): boolean {
  if (item.stub) return true;
  if (item.requireSuperAdmin) {
    return me.role.slug === 'super_admin' || !!me.isBootstrap;
  }
  if (item.requirePerm) {
    return me.role.permissionFlags[item.requirePerm] === true;
  }
  return true;
}

function AdminV2Login({ onLogin }: { onLogin: (me: AdminMe) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const result = await adminApi.login(username.trim(), password);
      setAdminToken(result.token);
      onLogin(result.account);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="av2-login">
      <form className="av2-login-card" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div className="av2-sidebar-logo-icon">
            <Layers size={14} />
          </div>
          <div>
            <div className="av2-login-title">Admin Panel</div>
            <div className="av2-login-sub">Derp Universe · v2</div>
          </div>
        </div>

        <label className="av2-login-label">Username</label>
        <input
          type="text"
          className="av2-login-input"
          placeholder="admin"
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        <label className="av2-login-label">Password</label>
        <input
          type="password"
          className="av2-login-input"
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button
          type="submit"
          className="av2-login-btn"
          disabled={loading || !username.trim() || !password}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        {error && <div className="av2-login-error">{error}</div>}
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
}: {
  me: AdminMe;
  collapsed: boolean;
  activeSection: Section;
  activeSub: string | null;
  onCollapse: () => void;
  onNavigate: (s: Section, sub?: string) => void;
  onLogout: () => void;
}) {
  const visibleItems = NAV_ITEMS.filter(item => isVisible(item, me));

  return (
    <div className={`av2-sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="av2-sidebar-logo">
        <div className="av2-sidebar-logo-icon">
          <Layers size={14} />
        </div>
        {!collapsed && <span className="av2-sidebar-logo-text">Admin v2</span>}
      </div>

      <nav className="av2-nav">
        {visibleItems.map(item => {
          const isActive = activeSection === item.key;
          const hasSubs = !collapsed && !item.stub && isActive && item.subs && item.subs.length > 0;

          return (
            <div key={item.key} className="av2-nav-section">
              <button
                className={`av2-nav-item${isActive ? ' active' : ''}`}
                onClick={() => onNavigate(item.key)}
                title={collapsed ? item.label : undefined}
              >
                <span className="av2-nav-icon">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.label}
                    </span>
                    {item.stub && <span className="av2-stub-badge">SOON</span>}
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
              </button>

              {hasSubs && (
                <div className="av2-nav-subs">
                  {item.subs!.map(sub => (
                    <button
                      key={sub.key}
                      className={`av2-nav-item sub${activeSub === sub.key ? ' active' : ''}`}
                      onClick={() => onNavigate(item.key, sub.key)}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="av2-sidebar-footer">
        <button className="av2-sidebar-collapse-btn" onClick={onLogout} title="Sign out">
          <LogOut size={13} style={{ flexShrink: 0 }} />
          {!collapsed && <span>Sign out</span>}
        </button>
        <button className="av2-sidebar-collapse-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );
}

function TopBar({
  me,
  activeSection,
  activeSub,
}: {
  me: AdminMe;
  activeSection: Section;
  activeSub: string | null;
}) {
  const labels: Record<Section, string> = {
    dashboard: 'Dashboard',
    content: 'Content Editor',
    approvals: 'Approvals',
    players: 'Player Management',
    'live-ops': 'Live Ops',
    economy: 'Balance Simulator',
    system: 'System Tools',
    support: 'Support',
    moderation: 'Moderation',
  };

  return (
    <div className="av2-topbar">
      <span className="av2-topbar-title">{labels[activeSection]}</span>
      {activeSub && (
        <span className="av2-topbar-sub">/ {activeSub}</span>
      )}
      <div className="av2-topbar-user">
        <span className="av2-topbar-user-name">{me.username}</span>
        <span className="av2-topbar-role">{me.role.name}</span>
      </div>
    </div>
  );
}

export default function AdminV2Shell() {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [checking, setChecking] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setChecking(false);
      return;
    }
    adminApi.getMe()
      .then(account => setMe(account))
      .catch(() => {
        clearAdminToken();
      })
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = useCallback((account: AdminMe) => {
    setMe(account);
    setActiveSection('dashboard');
    setActiveSub(null);
  }, []);

  const handleLogout = useCallback(() => {
    clearAdminToken();
    setMe(null);
    setActiveSection('dashboard');
    setActiveSub(null);
  }, []);

  const handleNavigate = useCallback((section: string, sub?: string) => {
    const s = section as Section;
    setActiveSection(s);
    setActiveSub(sub || null);
  }, []);

  if (checking) {
    return (
      <div className="av2-login">
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
      case 'content':
        return <AdminV2ContentSection me={me} activeGroup={activeSub || undefined} />;
      case 'approvals':
        return <AdminV2ApprovalsSection me={me} />;
      case 'players':
        return <AdminV2PlayersSection me={me} />;
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
      case 'live-ops':
        return (
          <AdminV2StubSection
            icon="📡"
            title="Live Ops"
            description="Tools for managing live game events, seasonal content pushes, and time-limited campaigns without a code deploy."
            plannedFeatures={[
              'Scheduled content activation and deactivation',
              'Event calendar with conflict detection',
              'Bulk reward distribution to player segments',
              'A/B test flag management',
              'Emergency killswitch controls',
            ]}
          />
        );
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

  return (
    <div className="av2-shell">
      <Sidebar
        me={me}
        collapsed={collapsed}
        activeSection={activeSection}
        activeSub={activeSub}
        onCollapse={() => setCollapsed(c => !c)}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />
      <div className="av2-main">
        <TopBar me={me} activeSection={activeSection} activeSub={activeSub} />
        <div className="av2-content">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
