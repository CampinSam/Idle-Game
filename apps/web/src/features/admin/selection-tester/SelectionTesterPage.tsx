import { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowLeft, Play, ChevronDown, ChevronUp } from 'lucide-react';
import type { RichSelection } from '@derp/shared';
import { adminApi, getAdminKey, setAdminKey } from '../adminApi';
import RichSelectionEditor from '../smart/components/structured/RichSelectionEditor';
import '../admin.css';

type Scenario = 'player' | 'mission' | 'crafting';
type SubTab = 'selection' | 'context';

interface ActivityContextFields {
  activityType: string;
  missionType: string;
  missionTags: string;
  regionId: string;
  seasonId: string;
}

const SCENARIO_DEFAULTS: Record<Scenario, ActivityContextFields> = {
  player:   { activityType: '', missionType: '', missionTags: '', regionId: '', seasonId: '' },
  mission:  { activityType: 'mission', missionType: '', missionTags: '', regionId: '', seasonId: '' },
  crafting: { activityType: 'crafting', missionType: '', missionTags: '', regionId: '', seasonId: '' },
};

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0d0d14', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid #1e1e2e', background: '#0d0d14', position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'transparent', border: '1px solid #2a2a3e', borderRadius: 8, color: '#a78bfa', cursor: 'pointer', fontSize: 13 },
  title: { fontSize: 20, fontWeight: 700, color: '#e2e8f0', margin: 0 },
  body: { padding: '24px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 },
  section: { background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 12, padding: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#a78bfa', marginBottom: 12 },
  row: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  input: { flex: 1, background: '#16162a', border: '1px solid #2a2a3e', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 14, outline: 'none' },
  smallInput: { background: '#16162a', border: '1px solid #2a2a3e', borderRadius: 8, padding: '6px 10px', color: '#e2e8f0', fontSize: 13, outline: 'none' },
  btn: { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#6d28d9', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  btnSecondary: { padding: '8px 16px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#a78bfa', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  searchResults: { position: 'absolute' as const, top: '100%', left: 0, right: 0, zIndex: 20, background: '#16162a', border: '1px solid #2a2a3e', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto' as const },
  searchResultItem: { padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #1e1e2e' },
  playerBadge: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, padding: '8px 12px', background: '#16162a', borderRadius: 8, border: '1px solid #2a2a3e' },
  tabBar: { display: 'flex', gap: 4, borderBottom: '1px solid #1e1e2e', marginBottom: 14 },
  tab: { padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', background: 'transparent', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  tabActive: { padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', background: 'rgba(109,40,217,0.25)', color: '#a78bfa', fontWeight: 600, fontSize: 13, cursor: 'pointer', borderBottom: '2px solid #7c3aed' },
  entityList: { display: 'flex', flexDirection: 'column' as const, gap: 6, maxHeight: 260, overflowY: 'auto' as const },
  entityRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#16162a', borderRadius: 8, border: '1px solid #1e1e2e', cursor: 'pointer', fontSize: 13 },
  entityRowSelected: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#1e1040', borderRadius: 8, border: '1px solid #7c3aed', cursor: 'pointer', fontSize: 13 },
  fieldGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginTop: 12 },
  fieldLabel: { fontSize: 11, color: '#64748b', marginBottom: 3 },
  runBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: '#059669', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  runBtnDisabled: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: '#1e2a26', border: 'none', borderRadius: 10, color: '#4a7a66', fontWeight: 700, fontSize: 15, cursor: 'not-allowed' },
  resultPassed: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#064e3b', borderRadius: 8, border: '1px solid #059669', color: '#34d399', fontWeight: 700, fontSize: 14 },
  resultFailed: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#450a0a', borderRadius: 8, border: '1px solid #dc2626', color: '#f87171', fontWeight: 700, fontSize: 14 },
  errorBox: { padding: '8px 12px', background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 8, color: '#f87171', fontSize: 13 },
  pre: { margin: 0, padding: '12px 14px', background: '#0a0a14', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', color: '#a5b4fc', overflowX: 'auto' as const, maxHeight: 400, overflowY: 'auto' as const, whiteSpace: 'pre' as const },
  infoBox: { padding: '10px 12px', background: '#0f172a', borderRadius: 8, border: '1px solid #1e293b', color: '#64748b', fontSize: 13 },
  collapseBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', padding: '2px 0', marginTop: 10 },
};

function ActivityContextPanel({
  scenario,
  value,
  onChange,
}: {
  scenario: Scenario;
  value: ActivityContextFields;
  onChange: (v: ActivityContextFields) => void;
}) {
  const [open, setOpen] = useState(scenario !== 'player');

  useEffect(() => {
    setOpen(scenario !== 'player');
  }, [scenario]);

  const update = (field: keyof ActivityContextFields, val: string) =>
    onChange({ ...value, [field]: val });

  return (
    <div style={{ marginTop: 12 }}>
      <button style={s.collapseBtn} onClick={() => setOpen(o => !o)}>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Activity Context {scenario === 'player' ? '(optional)' : ''}
      </button>
      {open && (
        <div style={s.fieldGrid}>
          <div>
            <div style={s.fieldLabel}>Activity Type</div>
            <input
              style={{ ...s.smallInput, width: '100%', boxSizing: 'border-box' as const }}
              value={value.activityType}
              placeholder={SCENARIO_DEFAULTS[scenario].activityType ?? ''}
              onChange={e => update('activityType', e.target.value)}
            />
          </div>
          {scenario !== 'crafting' && (
            <div>
              <div style={s.fieldLabel}>Mission Type</div>
              <input
                style={{ ...s.smallInput, width: '100%', boxSizing: 'border-box' as const }}
                value={value.missionType}
                placeholder="e.g. dungeon"
                onChange={e => update('missionType', e.target.value)}
              />
            </div>
          )}
          {scenario !== 'crafting' && (
            <div>
              <div style={s.fieldLabel}>Mission Tags (comma-separated)</div>
              <input
                style={{ ...s.smallInput, width: '100%', boxSizing: 'border-box' as const }}
                value={value.missionTags}
                placeholder="e.g. forest, combat"
                onChange={e => update('missionTags', e.target.value)}
              />
            </div>
          )}
          {scenario !== 'crafting' && (
            <div>
              <div style={s.fieldLabel}>Region ID</div>
              <input
                style={{ ...s.smallInput, width: '100%', boxSizing: 'border-box' as const }}
                value={value.regionId}
                placeholder="e.g. forest-region"
                onChange={e => update('regionId', e.target.value)}
              />
            </div>
          )}
          {scenario !== 'crafting' && (
            <div>
              <div style={s.fieldLabel}>Season ID</div>
              <input
                style={{ ...s.smallInput, width: '100%', boxSizing: 'border-box' as const }}
                value={value.seasonId}
                placeholder="e.g. summer"
                onChange={e => update('seasonId', e.target.value)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EntityPicker({
  entities,
  selected,
  onToggle,
  singleSelect,
}: {
  entities: any[];
  selected: string[];
  onToggle: (id: string) => void;
  singleSelect?: boolean;
}) {
  if (!entities.length) {
    return <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>No entities found for this player.</p>;
  }
  return (
    <div style={s.entityList}>
      {entities.map((e: any) => {
        const isSelected = selected.includes(e.id);
        const status = e.state?.status ?? 'idle';
        return (
          <div
            key={e.id}
            style={isSelected ? s.entityRowSelected : s.entityRow}
            onClick={() => onToggle(e.id)}
          >
            <span style={{ width: 14, height: 14, borderRadius: singleSelect ? 7 : 3, border: `2px solid ${isSelected ? '#7c3aed' : '#2a2a3e'}`, background: isSelected ? '#7c3aed' : 'transparent', flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontWeight: 600, color: '#e2e8f0', flex: 1 }}>{e.name || e.id}</span>
            <span style={{ color: '#64748b', fontSize: 11 }}>{e.role ?? e.entityType ?? ''}</span>
            <span style={{ color: '#64748b', fontSize: 11 }}>Lv.{e.level ?? '?'}</span>
            <span style={{ color: status === 'idle' ? '#34d399' : '#f59e0b', fontSize: 11 }}>{status}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function SelectionTesterPage() {
  const DEV_KEY = import.meta.env.DEV ? 'derp-admin-2026' : '';
  const adminKey = getAdminKey();
  const [authKey, setAuthKeyState] = useState(adminKey || DEV_KEY);
  const [authed, setAuthed] = useState(!!adminKey);
  const autoSubmitted = useRef(false);

  const doAuth = useCallback(async (key: string) => {
    setAdminKey(key);
    try {
      await adminApi.getTables();
      setAuthed(true);
    } catch {
      alert('Invalid admin key');
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV && DEV_KEY && !authed && !autoSubmitted.current) {
      autoSubmitted.current = true;
      doAuth(DEV_KEY);
    }
  }, [DEV_KEY, authed, doAuth]);

  const [playerQuery, setPlayerQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [playerData, setPlayerData] = useState<any | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const [rule, setRule] = useState<RichSelection | null>(null);

  const [scenario, setScenario] = useState<Scenario>('player');
  const [subTab, setSubTab] = useState<SubTab>('selection');

  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [activityContext, setActivityContext] = useState<ActivityContextFields>(
    SCENARIO_DEFAULTS['player'],
  );

  const [result, setResult] = useState<{ passed: boolean; resolvedContext: unknown } | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const handleScenarioChange = useCallback((sc: Scenario) => {
    setScenario(sc);
    setSelectedEntityIds([]);
    setActivityContext(SCENARIO_DEFAULTS[sc]);
    setResult(null);
    setRunError(null);
  }, []);

  const searchPlayers = useCallback(async () => {
    if (!playerQuery.trim()) return;
    setPlayerError(null);
    try {
      const res = await adminApi.searchPlayers(playerQuery.trim());
      setSearchResults(res);
      setSearchOpen(true);
    } catch (e: any) {
      setPlayerError(e.message || 'Search failed');
    }
  }, [playerQuery]);

  const loadPlayer = useCallback(async (id: string) => {
    setPlayerLoading(true);
    setPlayerError(null);
    setSearchOpen(false);
    setSelectedEntityIds([]);
    setResult(null);
    try {
      const data = await adminApi.getPlayer(id);
      setPlayerData(data);
    } catch (e: any) {
      setPlayerError(e.message || 'Failed to load player');
    } finally {
      setPlayerLoading(false);
    }
  }, []);

  const toggleEntity = useCallback((id: string, singleSelect = false) => {
    setSelectedEntityIds(prev =>
      singleSelect
        ? prev.includes(id) ? [] : [id]
        : prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }, []);

  const runTest = useCallback(async () => {
    if (!rule) { setRunError('Build a rule first using the Rule Editor.'); return; }
    if (!playerData) { setRunError('Load a player first.'); return; }

    setRunning(true);
    setRunError(null);
    setResult(null);

    const hasActivity = activityContext.activityType.trim() ||
      activityContext.missionType.trim() ||
      activityContext.missionTags.trim() ||
      activityContext.regionId.trim() ||
      activityContext.seasonId.trim();

    const actCtxPayload = hasActivity ? {
      activityType: activityContext.activityType.trim() || undefined,
      missionType: activityContext.missionType.trim() || undefined,
      missionTags: activityContext.missionTags
        ? activityContext.missionTags.split(',').map(t => t.trim()).filter(Boolean)
        : undefined,
      regionId: activityContext.regionId.trim() || undefined,
      seasonId: activityContext.seasonId.trim() || undefined,
    } : undefined;

    try {
      const res = await adminApi.evaluateSelection({
        rule,
        userId: playerData.id,
        entityIds: selectedEntityIds.length > 0 ? selectedEntityIds : undefined,
        activityContext: actCtxPayload,
      });
      setResult(res);
      setSubTab('context');
    } catch (e: any) {
      setRunError(e.message || 'Evaluation failed');
    } finally {
      setRunning(false);
    }
  }, [rule, playerData, selectedEntityIds, activityContext]);

  const entities: any[] = playerData?.entities ?? [];

  if (!authed) {
    return (
      <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#16162a', borderRadius: 12, padding: 32, width: 320, border: '1px solid #2a2a3e' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Admin Key Required</div>
          <input
            style={{ ...s.input, display: 'block', width: '100%', marginBottom: 12, boxSizing: 'border-box' }}
            type="password"
            value={authKey}
            placeholder="Admin key"
            onChange={e => setAuthKeyState(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doAuth(authKey)}
          />
          <button style={{ ...s.btn, width: '100%' }} onClick={() => doAuth(authKey)}>Authenticate</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => { window.location.href = '/admin'; }}>
          <ArrowLeft size={14} /> Admin
        </button>
        <h1 style={s.title}>Rich Selection Tester</h1>
        {result && (
          <div style={{ marginLeft: 'auto' }}>
            {result.passed
              ? <span style={s.resultPassed}>✓ PASSED</span>
              : <span style={s.resultFailed}>✗ FAILED</span>}
          </div>
        )}
      </div>

      <div style={s.body}>
        {/* Player Picker */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Player</div>
          <div style={{ position: 'relative' }}>
            <div style={s.row}>
              <input
                style={s.input}
                value={playerQuery}
                placeholder="Search by username or email…"
                onChange={e => { setPlayerQuery(e.target.value); setSearchOpen(false); }}
                onKeyDown={e => e.key === 'Enter' && searchPlayers()}
              />
              <button style={s.btn} onClick={searchPlayers} disabled={playerLoading}>
                {playerLoading ? 'Loading…' : 'Search'}
              </button>
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div style={s.searchResults}>
                {searchResults.map((p: any) => (
                  <div
                    key={p.id}
                    style={s.searchResultItem}
                    onClick={() => {
                      setPlayerQuery(p.username || p.email || p.id);
                      loadPlayer(p.id);
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1e1e2e'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{p.username || '(no username)'}</span>
                    <span style={{ color: '#64748b', marginLeft: 8 }}>{p.email}</span>
                    <span style={{ color: '#a78bfa', marginLeft: 8, fontSize: 11 }}>Lv.{p.keeperLevel}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {playerError && <div style={{ ...s.errorBox, marginTop: 8 }}>{playerError}</div>}
          {playerData && (
            <div style={s.playerBadge}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#6d28d9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: '#fff', flexShrink: 0 }}>
                {(playerData.username || '?')[0]?.toUpperCase()}
              </span>
              <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{playerData.username || '(no username)'}</span>
              {playerData.email && <span style={{ color: '#64748b', fontSize: 12 }}>{playerData.email}</span>}
              <span style={{ color: '#a78bfa', fontSize: 12, marginLeft: 'auto' }}>Keeper Lv.{playerData.keeperLevel ?? 0}</span>
              <span style={{ color: '#64748b', fontSize: 11 }}>{entities.length} entit{entities.length === 1 ? 'y' : 'ies'}</span>
            </div>
          )}
        </div>

        {/* Rule Editor */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Rule</div>
          <RichSelectionEditor value={rule} onChange={setRule} />
        </div>

        {/* Scenario Tabs */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Scenario</div>
          <div style={s.tabBar}>
            {(['player', 'mission', 'crafting'] as Scenario[]).map(sc => (
              <button
                key={sc}
                style={scenario === sc ? s.tabActive : s.tab}
                onClick={() => handleScenarioChange(sc)}
              >
                {sc.charAt(0).toUpperCase() + sc.slice(1)}
              </button>
            ))}
          </div>

          {/* Sub-tabs */}
          <div style={{ ...s.tabBar, borderBottomColor: '#0d0d14', marginBottom: 16 }}>
            {(['selection', 'context'] as SubTab[]).map(st => (
              <button
                key={st}
                style={subTab === st ? { ...s.tabActive, fontSize: 12, padding: '6px 12px' } : { ...s.tab, fontSize: 12, padding: '6px 12px' }}
                onClick={() => setSubTab(st)}
              >
                {st === 'selection' ? 'Selection Setup' : 'Raw Context'}
              </button>
            ))}
          </div>

          {subTab === 'selection' && (
            <div>
              {scenario === 'player' && (
                <div style={s.infoBox}>
                  The rule is evaluated against the loaded player's keeper level and flags only. No team is sent.
                </div>
              )}

              {scenario === 'mission' && (
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                    Select team members (multi-select). These mirror the entity IDs passed to <code style={{ color: '#a78bfa' }}>startMission</code>.
                  </div>
                  <EntityPicker
                    entities={entities}
                    selected={selectedEntityIds}
                    onToggle={id => toggleEntity(id, false)}
                  />
                </div>
              )}

              {scenario === 'crafting' && (
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                    Select one entity (crafting slots are single-entity). This mirrors the entity passed to <code style={{ color: '#a78bfa' }}>startCrafting</code>.
                  </div>
                  <EntityPicker
                    entities={entities}
                    selected={selectedEntityIds}
                    onToggle={id => toggleEntity(id, true)}
                    singleSelect
                  />
                </div>
              )}

              <ActivityContextPanel
                scenario={scenario}
                value={activityContext}
                onChange={setActivityContext}
              />
            </div>
          )}

          {subTab === 'context' && (
            <div>
              {result
                ? <pre style={s.pre}>{JSON.stringify(result.resolvedContext, null, 2)}</pre>
                : <div style={s.infoBox}>Run a test to see the resolved SelectionContext that was evaluated.</div>
              }
            </div>
          )}
        </div>

        {/* Run + Result */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const }}>
          <button
            style={running ? s.runBtnDisabled : s.runBtn}
            onClick={runTest}
            disabled={running}
          >
            <Play size={16} />
            {running ? 'Running…' : 'Run Test'}
          </button>

          {result && (
            result.passed
              ? <span style={s.resultPassed}>✓ PASSED</span>
              : <span style={s.resultFailed}>✗ FAILED</span>
          )}

          {runError && <div style={s.errorBox}>{runError}</div>}
        </div>
      </div>
    </div>
  );
}
