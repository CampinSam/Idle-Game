import React, { useState, useEffect, useReducer, useCallback, useMemo } from 'react';
import { adminApi } from '../adminApi';
import { TABLE_SCHEMAS, TABLE_API_KEYS, TABLE_GROUPS, TableSchema } from './tableSchemas';
import SmartField from './components/SmartField';
import { invalidateRefCache } from './components/RefSelect';
import { structuredFieldErrorCount, structuredFieldMessages } from './components/structured/validation';
import { migrateMissionOutcomes } from './migrateMissionOutcomes';
import TelemetryCardPreviewPanel from '../telemetry/TelemetryCardPreviewPanel';

interface TableEntry {
  key: string;
  name: string;
  table: string;
}

interface EditorState {
  record: Record<string, any> | null;
  original: Record<string, any> | null;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  isDraftMode: boolean;
  activeDraftId: string | null;
  draftOperation: string | null;
}

type EditorAction =
  | { type: 'LOAD'; record: Record<string, any> }
  | { type: 'LOAD_DIRTY'; record: Record<string, any> }
  | { type: 'LOAD_AS_DRAFT'; record: Record<string, any>; draftId: string; operation: string }
  | { type: 'SET_FIELD'; field: string; value: any }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_OK'; record: Record<string, any> }
  | { type: 'SAVE_ERR'; error: string }
  | { type: 'SAVE_DRAFT'; record: Record<string, any>; draftId: string; operation: string }
  | { type: 'CLEAR' };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'LOAD':
      return { record: { ...action.record }, original: { ...action.record }, dirty: false, saving: false, saveError: null, isDraftMode: false, activeDraftId: null, draftOperation: null };
    case 'LOAD_DIRTY':
      return { record: { ...action.record }, original: {}, dirty: true, saving: false, saveError: null, isDraftMode: false, activeDraftId: null, draftOperation: null };
    case 'LOAD_AS_DRAFT':
      return { record: { ...action.record }, original: { ...action.record }, dirty: false, saving: false, saveError: null, isDraftMode: true, activeDraftId: action.draftId, draftOperation: action.operation };
    case 'SET_FIELD':
      if (!state.record) return state;
      const updated = { ...state.record, [action.field]: action.value };
      return { ...state, record: updated, dirty: JSON.stringify(updated) !== JSON.stringify(state.original), saveError: null };
    case 'SAVE_START':
      return { ...state, saving: true, saveError: null };
    case 'SAVE_OK':
      return { record: { ...action.record }, original: { ...action.record }, dirty: false, saving: false, saveError: null, isDraftMode: false, activeDraftId: null, draftOperation: null };
    case 'SAVE_DRAFT':
      return { record: { ...action.record }, original: { ...action.record }, dirty: false, saving: false, saveError: null, isDraftMode: true, activeDraftId: action.draftId, draftOperation: action.operation };
    case 'SAVE_ERR':
      return { ...state, saving: false, saveError: action.error };
    case 'CLEAR':
      return { record: null, original: null, dirty: false, saving: false, saveError: null, isDraftMode: false, activeDraftId: null, draftOperation: null };
    default:
      return state;
  }
}

function buildNewRecord(tableName: string): Record<string, any> {
  const schema = TABLE_SCHEMAS[tableName];
  if (!schema) return {};
  const rec: Record<string, any> = {};
  Object.entries(schema.fields).forEach(([key, def]) => {
    if (def.default !== undefined) rec[key] = def.default;
  });
  return rec;
}

interface Props {
  adminKey: string;
}

function SectionedFormBody({
  schema,
  record,
  enumOptions,
  onSetField,
  activeSectionId,
  setActiveSectionId,
  customSectionContent,
}: {
  schema: TableSchema;
  record: Record<string, any>;
  enumOptions: Record<string, string[]>;
  onSetField: (field: string, value: any) => void;
  activeSectionId: string | null;
  setActiveSectionId: (id: string) => void;
  customSectionContent?: Record<string, React.ReactNode>;
}) {
  const sections = schema.sections!;
  const firstId = sections[0].id;
  const activeId = activeSectionId && sections.some(s => s.id === activeSectionId)
    ? activeSectionId
    : firstId;

  const fieldsBySection: Record<string, Array<[string, typeof schema.fields[string]]>> = {};
  sections.forEach(s => { fieldsBySection[s.id] = []; });
  Object.entries(schema.fields).forEach(([fname, fdef]) => {
    const sid = fdef.section && fieldsBySection[fdef.section] ? fdef.section : firstId;
    fieldsBySection[sid].push([fname, fdef]);
  });

  const errorCountBySection: Record<string, number> = {};
  sections.forEach(s => {
    let n = 0;
    fieldsBySection[s.id].forEach(([fname, fdef]) => {
      const effectiveType = fdef.typeResolver ? fdef.typeResolver(record) : fdef.type;
      n += structuredFieldErrorCount(effectiveType, record[fname]);
      if (fdef.required) {
        const v = record[fname];
        if (v === undefined || v === null || v === '') n++;
      }
    });
    errorCountBySection[s.id] = n;
  });

  const activeSection = sections.find(s => s.id === activeId)!;
  const activeFields = fieldsBySection[activeId];

  return (
    <>
      <div style={{
        display: 'flex', gap: 4, padding: '8px 16px 0', borderBottom: '1px solid #1a1a3e',
        flexShrink: 0, overflowX: 'auto',
      }}>
        {sections.map(s => {
          const isActive = s.id === activeId;
          const errors = errorCountBySection[s.id];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSectionId(s.id)}
              style={{
                padding: '8px 14px',
                background: isActive ? '#1a1a3e' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid #a78bfa' : '2px solid transparent',
                color: isActive ? '#e0e0ff' : '#888',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'color 0.15s, background 0.15s',
              }}
              title={s.description}
            >
              {s.label}
              {errors > 0 && (
                <span style={{
                  background: '#ef4444', color: '#fff', borderRadius: 8,
                  fontSize: 9, padding: '1px 5px', fontWeight: 700,
                  minWidth: 14, textAlign: 'center', lineHeight: 1.4,
                }}>
                  {errors}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {customSectionContent && customSectionContent[activeId] != null ? (
        customSectionContent[activeId]
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {activeSection.description && (
            <div style={{ fontSize: 11, color: '#666', letterSpacing: '0.02em' }}>
              {activeSection.description}
            </div>
          )}
          {activeFields.map(([fieldName, fieldDef]) => {
            const resolvedDef = fieldDef.typeResolver
              ? { ...fieldDef, type: fieldDef.typeResolver(record) }
              : fieldDef;
            return (
              <SmartField
                key={fieldName}
                fieldName={fieldName}
                fieldDef={resolvedDef}
                value={record[fieldName]}
                onChange={val => onSetField(fieldName, val)}
                enumOptions={enumOptions}
              />
            );
          })}
          {activeFields.length === 0 && (
            <div style={{ color: '#555', fontSize: 12 }}>No fields in this section.</div>
          )}
        </div>
      )}
    </>
  );
}

export default function SmartAdminEditor({ adminKey: _ }: Props) {
  const [tables, setTables] = useState<TableEntry[]>([]);
  const [activeTable, setActiveTable] = useState<string>('');
  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [enumOptions, setEnumOptions] = useState<Record<string, string[]>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  const [editorState, dispatch] = useReducer(editorReducer, {
    record: null, original: null, dirty: false, saving: false, saveError: null,
    isDraftMode: false, activeDraftId: null, draftOperation: null,
  });

  const [me, setMe] = useState<any>(null);
  const [pendingDrafts, setPendingDrafts] = useState<Record<string, any>>({});
  const [rejectedDrafts, setRejectedDrafts] = useState<Record<string, any>>({});

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getTables().then(setTables).catch(() => {});
    fetch('/api/meta/enums').then(r => r.json()).then(setEnumOptions).catch(() => {});
    adminApi.getMe().then(setMe).catch(() => {});
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadPendingDrafts = useCallback(async (tableKey: string, myId?: string) => {
    if (!tableKey) { setPendingDrafts({}); return; }
    try {
      // Filter by authorId so users only see their own pending drafts in the editor overlay
      const drafts = await adminApi.listDrafts({ tableName: tableKey, status: 'pending', authorId: myId });
      const map: Record<string, any> = {};
      (drafts as any[]).forEach((d: any) => { map[d.recordId] = d; });
      setPendingDrafts(map);
    } catch {
      setPendingDrafts({});
    }
  }, []);

  const loadRejectedDrafts = useCallback(async (tableKey: string, myId?: string) => {
    if (!tableKey || !myId) { setRejectedDrafts({}); return; }
    try {
      // Fetch the author's own rejected drafts so we can show a banner in the editor
      const drafts = await adminApi.listDrafts({ tableName: tableKey, status: 'rejected', authorId: myId });
      const map: Record<string, any> = {};
      // Keep only the most-recent rejection per recordId
      (drafts as any[]).forEach((d: any) => {
        if (!map[d.recordId] || new Date(d.createdAt) > new Date(map[d.recordId].createdAt)) {
          map[d.recordId] = d;
        }
      });
      setRejectedDrafts(map);
    } catch {
      setRejectedDrafts({});
    }
  }, []);

  // Re-load drafts once `me` resolves (handles the race between table-select and getMe)
  useEffect(() => {
    if (me?.id && activeMappedKey) {
      loadPendingDrafts(activeMappedKey, me.id);
      loadRejectedDrafts(activeMappedKey, me.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  const activeMappedKey = useMemo(() => {
    if (!activeTable) return '';
    const entry = tables.find(t => t.key === activeTable);
    return entry?.key || activeTable;
  }, [activeTable, tables]);

  const loadRecords = useCallback(async (tableKey: string) => {
    setRecordsLoading(true);
    setRecords([]);
    try {
      const data = await adminApi.list(tableKey);
      setRecords(Array.isArray(data) ? data : []);
    } catch { setRecords([]); }
    finally { setRecordsLoading(false); }
  }, []);

  const handleSelectTable = (key: string) => {
    if (editorState.dirty) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    setActiveTable(key);
    setSelectedId(null);
    setIsNew(false);
    setSearch('');
    setActiveSectionId(null);
    dispatch({ type: 'CLEAR' });
    loadRecords(key);
    loadPendingDrafts(key, me?.id);
    loadRejectedDrafts(key, me?.id);
  };

  const handleSelectRecord = (rec: any) => {
    if (editorState.dirty) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    setSelectedId(rec.id);
    setDeleteConfirm(false);

    if (rec._ghostDraft) {
      // Pending create draft with no live record yet — open as new record in draft mode
      setIsNew(true);
      const draftPayload =
        typeof rec._draft.payload === 'object' && rec._draft.payload !== null
          ? rec._draft.payload
          : {};
      dispatch({ type: 'LOAD_AS_DRAFT', record: draftPayload as Record<string, any>, draftId: rec._draft.id, operation: 'create' });
      return;
    }

    setIsNew(false);
    const pendingDraft = pendingDrafts[rec.id];
    if (pendingDraft) {
      const draftPayload =
        typeof pendingDraft.payload === 'object' && pendingDraft.payload !== null
          ? pendingDraft.payload
          : rec;
      dispatch({ type: 'LOAD_AS_DRAFT', record: draftPayload as Record<string, any>, draftId: pendingDraft.id, operation: pendingDraft.operation });
    } else if (activeTable === TABLE_API_KEYS.MissionDef) {
      const { record: migrated, migrated: wasMigrated } = migrateMissionOutcomes(rec);
      dispatch({ type: wasMigrated ? 'LOAD_DIRTY' : 'LOAD', record: migrated });
    } else {
      dispatch({ type: 'LOAD', record: rec });
    }
  };

  const handleNewRecord = () => {
    if (editorState.dirty) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    const blank = buildNewRecord(getSchemaName());
    setSelectedId(null);
    setIsNew(true);
    setDeleteConfirm(false);
    dispatch({ type: 'LOAD', record: blank });
  };

  const handleDuplicate = () => {
    if (!editorState.record) return;
    if (editorState.dirty) {
      if (!confirm('You have unsaved changes. Duplicate your current edits as a new record?')) return;
    }
    const { id, createdAt, updatedAt, ...rest } = editorState.record;
    const duplicated =
      activeTable === TABLE_API_KEYS.MissionDef
        ? migrateMissionOutcomes(rest).record
        : rest;
    setSelectedId(null);
    setIsNew(true);
    setDeleteConfirm(false);
    dispatch({ type: 'LOAD_DIRTY', record: duplicated });
  };

  const getSchemaName = () => {
    const entry = Object.entries(TABLE_API_KEYS).find(([, v]) => v === activeTable);
    return entry ? entry[0] : '';
  };

  const schema = useMemo(() => {
    const sn = getSchemaName();
    return sn ? TABLE_SCHEMAS[sn] : null;
  }, [activeTable, tables]);

  const structuredErrorMessages = useMemo(() => {
    if (!schema || !editorState.record) return [] as string[];
    const msgs: string[] = [];
    Object.entries(schema.fields).forEach(([fname, fdef]) => {
      const effectiveType = fdef.typeResolver ? fdef.typeResolver(editorState.record!) : fdef.type;
      msgs.push(...structuredFieldMessages(effectiveType, fname, editorState.record![fname]));
    });
    return msgs;
  }, [schema, editorState.record]);

  const structuredErrorCount = useMemo(() => {
    if (!schema || !editorState.record) return 0;
    let n = 0;
    Object.entries(schema.fields).forEach(([fname, fdef]) => {
      const effectiveType = fdef.typeResolver ? fdef.typeResolver(editorState.record!) : fdef.type;
      n += structuredFieldErrorCount(effectiveType, editorState.record![fname]);
    });
    return n;
  }, [schema, editorState.record]);

  const handleSave = async () => {
    if (!editorState.record) return;
    if (structuredErrorCount > 0) return;
    dispatch({ type: 'SAVE_START' });
    try {
      let saved: any;
      if (isNew) {
        saved = await adminApi.create(activeMappedKey, editorState.record);
      } else {
        saved = await adminApi.update(activeMappedKey, editorState.record.id, editorState.record);
      }
      if (saved?.mode === 'draft') {
        // Non-super-admin: draft submitted for review
        if (isNew) {
          // New record draft — clear the editor (record doesn't exist yet)
          dispatch({ type: 'CLEAR' });
          setIsNew(false);
          setSelectedId(null);
        } else {
          dispatch({ type: 'SAVE_DRAFT', record: editorState.record, draftId: saved.draftId, operation: saved.operation });
        }
        await loadPendingDrafts(activeMappedKey, me?.id);
        await loadRecords(activeTable);
      } else {
        dispatch({ type: 'SAVE_OK', record: saved });
        setIsNew(false);
        setSelectedId(saved.id);
        invalidateRefCache(activeTable);
        await loadRecords(activeTable);
        await loadPendingDrafts(activeMappedKey, me?.id);
      }
    } catch (e: any) {
      dispatch({ type: 'SAVE_ERR', error: e.message || 'Save failed' });
    }
  };

  const handleDelete = async () => {
    if (!editorState.record?.id || isNew) return;
    try {
      const result: any = await adminApi.delete(activeMappedKey, editorState.record.id);
      if (result?.mode === 'draft') {
        // Non-super-admin: delete draft submitted
        dispatch({ type: 'SAVE_DRAFT', record: editorState.record, draftId: result.draftId, operation: 'delete' });
        setDeleteConfirm(false);
        await loadPendingDrafts(activeMappedKey, me?.id);
      } else {
        dispatch({ type: 'CLEAR' });
        setSelectedId(null);
        setDeleteConfirm(false);
        invalidateRefCache(activeTable);
        await loadRecords(activeTable);
        await loadPendingDrafts(activeMappedKey, me?.id);
      }
    } catch (e: any) {
      dispatch({ type: 'SAVE_ERR', error: e.message || 'Delete failed' });
    }
  };

  const isSuperAdmin = me?.role?.slug === 'super_admin' || me?.isBootstrap === true;

  const ghostCreateDrafts = useMemo<any[]>(() => {
    const liveIds = new Set(records.map((r: any) => r.id));
    return Object.values(pendingDrafts)
      .filter((d: any) => d.operation === 'create' && !liveIds.has(d.recordId))
      .map((d: any) => ({
        id:          d.recordId,
        name:        '[Pending Create Draft]',
        _ghostDraft: true,
        _draft:      d,
      }));
  }, [pendingDrafts, records]);

  const filteredRecords = useMemo(() => {
    const filtered = records.filter((r: any) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (r.id || '').toLowerCase().includes(s) || (r.name || '').toLowerCase().includes(s);
    });
    return [...ghostCreateDrafts, ...filtered];
  }, [records, search, ghostCreateDrafts]);

  const tableGroupsForSidebar = useMemo(() => {
    const grouped: Array<{ group: string; items: TableEntry[] }> = [];
    const usedKeys = new Set<string>();
    Object.entries(TABLE_GROUPS).forEach(([group, schemaNames]) => {
      const items = schemaNames
        .map(sn => {
          const apiKey = TABLE_API_KEYS[sn];
          return tables.find(t => t.key === apiKey);
        })
        .filter(Boolean) as TableEntry[];
      if (items.length) {
        grouped.push({ group, items });
        items.forEach(i => usedKeys.add(i.key));
      }
    });
    const misc = tables.filter(t => !usedKeys.has(t.key));
    if (misc.length) grouped.push({ group: 'Other', items: misc });
    return grouped;
  }, [tables]);

  const sidebarWidth = sidebarCollapsed ? 44 : 220;

  const controlStyle: React.CSSProperties = {
    height: 40,
    padding: '0 12px',
    background: '#111128',
    border: '1px solid #2a2a4e',
    borderRadius: 6,
    color: '#e0e0ff',
    fontSize: 13,
    cursor: 'pointer',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      height: '100vh',
      background: '#0a0a1a',
      color: '#e0e0ff',
      fontFamily: "'ui-monospace', 'SFMono-Regular', 'Fira Code', monospace",
      overflow: 'hidden',
    }}>

      {/* ── MOBILE: two-row command bar ── */}
      {isMobile && (
        <div style={{ flexShrink: 0, background: '#08081a' }}>

          {/* Row 1 — identity strip */}
          <div style={{
            height: 36,
            padding: '0 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1a1a3e',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#a78bfa',
                boxShadow: '0 0 6px #a78bfa',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.05em' }}>
                DEF EDITOR
              </span>
            </div>
          </div>

          {/* Row 2 — controls strip */}
          <div style={{
            height: 48,
            padding: '0 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: '1px solid #1a1a3e',
          }}>
            <select
              value={activeTable}
              onChange={e => handleSelectTable(e.target.value)}
              style={{ ...controlStyle, flex: 1 }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.6)'; e.currentTarget.style.outline = '2px solid rgba(167,139,250,0.2)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e'; e.currentTarget.style.outline = 'none'; }}
            >
              <option value="">— table —</option>
              {tableGroupsForSidebar.map(({ group, items }) => (
                <optgroup key={group} label={group}>
                  {items.map(t => (
                    <option key={t.key} value={t.key}>{t.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="filter..."
              style={{ ...controlStyle, width: 100, cursor: 'text' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.6)'; e.currentTarget.style.outline = '2px solid rgba(167,139,250,0.2)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e'; e.currentTarget.style.outline = 'none'; }}
            />
          </div>
        </div>
      )}

      {/* ── DESKTOP: collapsible sidebar ── */}
      {!isMobile && (
        <div style={{
          width: sidebarWidth,
          borderRight: '1px solid #1a1a3e',
          overflowY: sidebarCollapsed ? 'hidden' : 'auto',
          overflowX: 'hidden',
          flexShrink: 0,
          background: '#0d0d20',
          transition: 'width 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            padding: sidebarCollapsed ? '12px 0' : '14px 16px 10px',
            borderBottom: '1px solid #1a1a3e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'space-between',
            flexShrink: 0,
          }}>
            {!sidebarCollapsed && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#a78bfa' }}>Def Editor</div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed(c => !c)}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{
                background: 'none', border: '1px solid #2a2a4e', borderRadius: 6,
                color: '#666', cursor: 'pointer', fontSize: 14,
                width: 28, height: 28, display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0, transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#a78bfa'; e.currentTarget.style.borderColor = '#a78bfa'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = '#2a2a4e'; }}
            >
              {sidebarCollapsed ? '›' : '‹'}
            </button>
          </div>

          {!sidebarCollapsed && tableGroupsForSidebar.map(({ group, items }) => (
            <div key={group}>
              <div style={{ padding: '10px 16px 4px', fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                {group}
              </div>
              {items.map(t => (
                <div
                  key={t.key}
                  onClick={() => handleSelectTable(t.key)}
                  style={{
                    padding: '8px 16px', cursor: 'pointer', fontSize: 13,
                    background: activeTable === t.key ? 'rgba(167,139,250,0.15)' : 'transparent',
                    color: activeTable === t.key ? '#a78bfa' : '#bbb',
                    borderLeft: activeTable === t.key ? '3px solid #a78bfa' : '3px solid transparent',
                    transition: 'all 0.1s', whiteSpace: 'nowrap', overflow: 'hidden',
                  }}
                  onMouseEnter={e => { if (activeTable !== t.key) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                  onMouseLeave={e => { if (activeTable !== t.key) e.currentTarget.style.background = 'transparent'; }}
                >
                  {t.name}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── DESKTOP: 260px record list panel ── */}
      {!isMobile && (
        <div style={{ width: 260, borderRight: '1px solid #1a1a3e', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #1a1a3e', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{ flex: 1, padding: '6px 10px', background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, color: '#e0e0ff', fontSize: 12, boxSizing: 'border-box' }}
            />
            <button
              type="button"
              disabled={!activeTable}
              onClick={handleNewRecord}
              style={{
                padding: '6px 10px', background: activeTable ? '#7c3aed' : '#333', border: 'none',
                borderRadius: 6, color: '#fff', cursor: activeTable ? 'pointer' : 'not-allowed', fontSize: 18, lineHeight: 1,
              }}
              title="New record"
            >
              +
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!activeTable && (
              <div style={{ padding: 20, color: '#555', fontSize: 13, textAlign: 'center' }}>
                Select a table from the sidebar
              </div>
            )}
            {activeTable && recordsLoading && (
              <div style={{ padding: 20, color: '#555', fontSize: 13, textAlign: 'center' }}>Loading...</div>
            )}
            {activeTable && !recordsLoading && filteredRecords.length === 0 && (
              <div style={{ padding: 20, color: '#555', fontSize: 13, textAlign: 'center' }}>
                {search ? 'No matches' : 'No records yet'}
              </div>
            )}
            {filteredRecords.map(r => {
              const rowBadge = !r._ghostDraft ? (schema?.getRowBadge?.(r) ?? null) : null;
              const hasPendingDraft = !r._ghostDraft && !!pendingDrafts[r.id];
              return (
                <div
                  key={r.id}
                  onClick={() => handleSelectRecord(r)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #1a1a3e',
                    background: selectedId === r.id
                      ? (r._ghostDraft ? 'rgba(245,158,11,0.1)' : 'rgba(167,139,250,0.12)')
                      : (r._ghostDraft ? 'rgba(245,158,11,0.04)' : 'transparent'),
                    borderLeft: selectedId === r.id ? `3px solid ${r._ghostDraft ? '#f59e0b' : '#a78bfa'}` : hasPendingDraft ? '3px solid #f59e0b' : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (selectedId !== r.id) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { if (selectedId !== r.id) e.currentTarget.style.background = r._ghostDraft ? 'rgba(245,158,11,0.04)' : 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: selectedId === r.id ? (r._ghostDraft ? '#fbbf24' : '#a78bfa') : (r._ghostDraft ? '#d97706' : '#e0e0ff'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                      {r.id}
                    </div>
                    {r._ghostDraft && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: '0.5px',
                        padding: '1px 5px', borderRadius: 3,
                        background: '#78350f', color: '#fbbf24',
                        textTransform: 'uppercase', flexShrink: 0, lineHeight: '14px',
                      }}>
                        PENDING CREATE
                      </span>
                    )}
                    {hasPendingDraft && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: '0.5px',
                        padding: '1px 5px', borderRadius: 3,
                        background: '#92400e', color: '#fbbf24',
                        textTransform: 'uppercase', flexShrink: 0, lineHeight: '14px',
                      }}>
                        DRAFT
                      </span>
                    )}
                    {rowBadge && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: '0.5px',
                        padding: '1px 5px', borderRadius: 3,
                        background: rowBadge.color, color: '#fff',
                        textTransform: 'uppercase', flexShrink: 0, lineHeight: '14px',
                      }}>
                        {rowBadge.label}
                      </span>
                    )}
                  </div>
                  {r.name && (
                    <div style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {activeTable && !recordsLoading && (
            <div style={{ padding: '6px 14px', borderTop: '1px solid #1a1a3e', color: '#555', fontSize: 11 }}>
              {records.length} record{records.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* ── Form column (always rendered, full-width on mobile) ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* MOBILE: record picker strip */}
        {isMobile && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            background: '#0d0d1e',
            borderBottom: '1px solid #1a1a3e',
            flexShrink: 0,
          }}>
            <select
              value={selectedId ?? ''}
              disabled={!activeTable || recordsLoading}
              onChange={e => {
                const rec = records.find(r => r.id === e.target.value);
                if (rec) handleSelectRecord(rec);
              }}
              style={{
                ...controlStyle,
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                opacity: !activeTable ? 0.4 : 1,
                cursor: !activeTable ? 'not-allowed' : 'pointer',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.6)'; e.currentTarget.style.outline = '2px solid rgba(167,139,250,0.2)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e'; e.currentTarget.style.outline = 'none'; }}
            >
              <option value="">
                {!activeTable ? '— select a table first —' : recordsLoading ? 'Loading...' : filteredRecords.length === 0 ? '— no records —' : '— select record —'}
              </option>
              {filteredRecords.map(r => (
                <option key={r.id} value={r.id}>
                  {r.id}{r.name ? ` — ${r.name}` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!activeTable}
              onClick={handleNewRecord}
              title="New record"
              style={{
                width: 44,
                height: 40,
                flexShrink: 0,
                background: activeTable ? 'linear-gradient(135deg, #6d28d9, #a78bfa)' : '#1a1a2e',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 22,
                lineHeight: 1,
                cursor: activeTable ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: activeTable ? 1 : 0.3,
                transition: 'background 0.15s, opacity 0.15s',
              }}
            >
              +
            </button>
          </div>
        )}

        {/* Form content */}
        {!editorState.record ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#555', fontSize: 14 }}>
            {isMobile ? (
              <>
                <span style={{ fontSize: 28, opacity: 0.3 }}>◆</span>
                <span style={{ fontSize: 13, color: '#3a3a5e', letterSpacing: '0.05em' }}>
                  {!activeTable ? 'CHOOSE A TABLE FIRST' : 'PICK A RECORD ABOVE'}
                </span>
              </>
            ) : (
              <span>{activeTable ? 'Select a record or create a new one' : 'Select a table to begin'}</span>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* PENDING REVIEW banner */}
              {editorState.isDraftMode && (
                <div style={{
                  padding: '8px 20px',
                  background: 'rgba(146, 64, 14, 0.25)',
                  borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#fbbf24', textTransform: 'uppercase' }}>
                    ⏳ {editorState.draftOperation === 'delete' ? 'DELETE' : 'EDIT'} PENDING REVIEW
                  </span>
                  <span style={{ fontSize: 11, color: '#d97706', flex: 1 }}>
                    Changes are queued for approval and are not live yet.
                  </span>
                </div>
              )}
              {/* REJECTED DRAFT banner — show when the current record has a rejected draft from this author */}
              {!editorState.isDraftMode && selectedId && rejectedDrafts[selectedId] && (() => {
                const rd = rejectedDrafts[selectedId];
                return (
                  <div style={{
                    padding: '8px 20px',
                    background: 'rgba(127, 29, 29, 0.3)',
                    borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#f87171', textTransform: 'uppercase' }}>
                      ✗ DRAFT REJECTED
                    </span>
                    <span style={{ fontSize: 11, color: '#fca5a5', flex: 1 }}>
                      {rd.reviewComment
                        ? <>Reviewer comment: <em>"{rd.reviewComment}"</em></>
                        : 'Your previous draft was rejected. You may submit a new one.'}
                    </span>
                    <span style={{ fontSize: 10, color: '#7f1d1d' }}>
                      by {rd.reviewer?.username ?? '?'} · {new Date(rd.updatedAt).toLocaleString()}
                    </span>
                  </div>
                );
              })()}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #1a1a3e', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#e0e0ff', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isNew ? 'New Record' : (editorState.record.id || 'Record')}
                  </span>
                  {editorState.dirty && (
                    <span style={{ color: '#f59e0b', fontSize: 11, letterSpacing: '0.04em' }}>● UNSAVED</span>
                  )}
                </div>
                {editorState.saveError && (
                  <span style={{ color: '#ef4444', fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {editorState.saveError}
                  </span>
                )}
                {!isNew && !deleteConfirm && !editorState.isDraftMode && (
                  <>
                    <button
                      type="button"
                      onClick={handleDuplicate}
                      title="Duplicate this record as a new unsaved entry"
                      style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #2a2a6e', borderRadius: 6, color: '#a78bfa', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#a78bfa'; e.currentTarget.style.background = 'rgba(167,139,250,0.08)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a6e'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(true)}
                      style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #444', borderRadius: 6, color: '#888', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
                    >
                      Delete
                    </button>
                  </>
                )}
                {deleteConfirm && (
                  <>
                    <span style={{ color: '#ef4444', fontSize: 12, flexShrink: 0 }}>Confirm?</span>
                    <button type="button" onClick={handleDelete} style={{ padding: '6px 10px', background: '#ef4444', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>Yes</button>
                    <button type="button" onClick={() => setDeleteConfirm(false)} style={{ padding: '6px 10px', background: '#333', border: 'none', borderRadius: 6, color: '#ccc', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>No</button>
                  </>
                )}
                {structuredErrorCount > 0 && (
                  <details style={{ flexShrink: 0, maxWidth: 320 }}>
                    <summary style={{ color: '#ef4444', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                      {structuredErrorCount} validation issue{structuredErrorCount === 1 ? '' : 's'}
                    </summary>
                    <ul style={{ margin: '4px 0 0 8px', padding: 0, listStyle: 'none' }}>
                      {structuredErrorMessages.map((msg, i) => (
                        <li key={i} style={{ color: '#fca5a5', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          · {msg}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {!editorState.isDraftMode && (
                  <>
                    {isSuperAdmin && (
                      <span title="You are super_admin — saves publish directly to the live database" style={{ fontSize: 10, color: '#4ade80', fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}>
                        ⚡ LIVE
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={editorState.saving || !editorState.dirty || structuredErrorCount > 0}
                      title={structuredErrorCount > 0 ? 'Fix validation errors before saving' : isSuperAdmin ? 'Save directly to live database (super_admin)' : 'Submit change for review'}
                      style={{
                        padding: '6px 16px', flexShrink: 0,
                        background: editorState.dirty && structuredErrorCount === 0 ? 'linear-gradient(135deg, #7c3aed, #a78bfa)' : '#333',
                        border: 'none', borderRadius: 6, color: '#fff',
                        cursor: editorState.dirty && structuredErrorCount === 0 ? 'pointer' : 'not-allowed',
                        fontSize: 13, fontWeight: 600,
                        opacity: editorState.saving ? 0.7 : 1,
                      }}
                    >
                      {editorState.saving ? 'Saving...' : isSuperAdmin ? 'Publish' : 'Submit for Review'}
                    </button>
                  </>
                )}
                {editorState.isDraftMode && editorState.dirty && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={editorState.saving || structuredErrorCount > 0}
                    title="Submit updated draft for review"
                    style={{
                      padding: '6px 16px', flexShrink: 0,
                      background: 'linear-gradient(135deg, #92400e, #d97706)',
                      border: 'none', borderRadius: 6, color: '#fff',
                      cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      opacity: editorState.saving ? 0.7 : 1,
                    }}
                  >
                    {editorState.saving ? 'Submitting...' : 'Resubmit Draft'}
                  </button>
                )}
              </div>

              {schema?.sections && schema.sections.length > 0 ? (
                <SectionedFormBody
                  schema={schema}
                  record={editorState.record!}
                  enumOptions={enumOptions}
                  onSetField={(field, value) => dispatch({ type: 'SET_FIELD', field, value })}
                  activeSectionId={activeSectionId}
                  setActiveSectionId={setActiveSectionId}
                  customSectionContent={
                    getSchemaName() === 'TelemetryDef'
                      ? { preview: <TelemetryCardPreviewPanel record={editorState.record!} /> }
                      : undefined
                  }
                />
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {schema && Object.entries(schema.fields).map(([fieldName, fieldDef]) => (
                    <SmartField
                      key={fieldName}
                      fieldName={fieldName}
                      fieldDef={fieldDef}
                      value={editorState.record![fieldName]}
                      onChange={val => dispatch({ type: 'SET_FIELD', field: fieldName, value: val })}
                      enumOptions={enumOptions}
                    />
                  ))}
                  {!schema && (
                    <div style={{ color: '#555', fontSize: 13 }}>
                      No schema defined for this table. Records can still be saved.
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
