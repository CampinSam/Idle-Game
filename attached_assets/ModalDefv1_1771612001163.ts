import React, { useEffect, useMemo, useState } from "react";

// -------------------------
// Types (subset of your schema)
// -------------------------
type ModalSpecV1 = {
  version: 1;
  id: string;
  kind: string;
  dismiss: { backdrop: boolean; x: boolean; escape: boolean };
  header: {
    title: string;
    subtitle?: string;
    icon?: AssetRef;
    banner?: AssetRef;
  };
  body: Block[];
  buttons: ButtonSpec[];
  telemetry?: {
    sourceType?: string;
    sourceId?: string;
    notificationId?: string;
    jobId?: string;
    templateId?: string;
    experiment?: string;
  };
};

type AssetRef = { assetKey: string; alt?: string };

type ButtonSpec = {
  id: string;
  label: string;
  variant: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  action: Action;
  requiresConfirm?: {
    title: string;
    body: RichTextDoc;
    confirmLabel?: string;
    cancelLabel?: string;
  };
};

type Action =
  | { type: "CLOSE_MODAL" }
  | { type: "NAVIGATE"; route: string; params?: Record<string, unknown> }
  | { type: "ACK_NOTIFICATION"; notificationId: string }
  | { type: "COMPLETE_JOB"; jobId: string }
  | { type: "CLAIM_GIFT"; giftId: string }
  | { type: "OPEN_INVENTORY" }
  | { type: "OPEN_MISSIONS" }
  | { type: "OPEN_CRAFTING" }
  | { type: "REPEAT_MISSION"; missionDefId: string }
  | { type: "CRAFT_AGAIN"; recipeDefId: string }
  | { type: "API_CALL"; apiKey: string; payload?: Record<string, unknown> };

type Block =
  | { type: "richText"; doc: RichTextDoc }
  | { type: "divider" }
  | { type: "image"; image: AssetRef; caption?: string }
  | { type: "metaRows"; rows: { label: string; value: string }[] }
  | { type: "timer"; endsAt: string; label?: string }
  | { type: "rewardsPreview"; items: RewardItem[] }
  | { type: "rewardsList"; title?: string; items: RewardItem[] }
  | { type: "error"; message: string };

type RewardItem = { assetKey?: string; name: string; qty?: number; note?: string };

type RichTextDoc = RichTextNode[];
type RichTextNode =
  | { t: "p" | "h1" | "h2" | "ul" | "li" | "strong" | "em" | "code" | "link"; c: RichTextNode[]; href?: string }
  | { t: "text"; v: string }
  | { t: "br" }
  | { t: "token"; key: string }; // ideally resolved server-side; client can ignore or show placeholder

// -------------------------
// Modal host API (example)
// -------------------------
type ModalProps = {
  spec: ModalSpecV1;
  isOpen: boolean;
  onRequestClose: () => void;

  // You provide these integrations
  navigate: (route: string, params?: Record<string, unknown>) => void;
  apiCall: (apiKey: string, payload?: Record<string, unknown>) => Promise<void>;
};

export function GameModal(props: ModalProps) {
  const { spec, isOpen, onRequestClose, navigate, apiCall } = props;

  // Close on Escape (if enabled)
  useEffect(() => {
    if (!isOpen || !spec.dismiss.escape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRequestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, spec.dismiss.escape, onRequestClose]);

  if (!isOpen) return null;

  const onBackdropClick = () => {
    if (spec.dismiss.backdrop) onRequestClose();
  };

  const onXClick = () => {
    if (spec.dismiss.x) onRequestClose();
  };

  const dispatchAction = async (action: Action) => {
    // Strict allowlist: only known action types do anything.
    switch (action.type) {
      case "CLOSE_MODAL":
        onRequestClose();
        return;

      case "NAVIGATE":
        navigate(action.route, action.params);
        onRequestClose();
        return;

      case "OPEN_INVENTORY":
        navigate("inventory");
        onRequestClose();
        return;

      case "OPEN_MISSIONS":
        navigate("missions");
        onRequestClose();
        return;

      case "OPEN_CRAFTING":
        navigate("crafting");
        onRequestClose();
        return;

      case "ACK_NOTIFICATION":
        await apiCall("notifications.ack", { notificationId: action.notificationId });
        onRequestClose();
        return;

      case "COMPLETE_JOB":
        await apiCall("jobs.complete", { jobId: action.jobId });
        // Often you’ll fetch & show a follow-up results modal here instead of closing.
        onRequestClose();
        return;

      case "CLAIM_GIFT":
        await apiCall("gifts.claim", { giftId: action.giftId });
        onRequestClose();
        return;

      case "REPEAT_MISSION":
        await apiCall("missions.repeat", { missionDefId: action.missionDefId });
        onRequestClose();
        return;

      case "CRAFT_AGAIN":
        navigate("crafting", { recipeDefId: action.recipeDefId });
        onRequestClose();
        return;

      case "API_CALL":
        await apiCall(action.apiKey, action.payload);
        onRequestClose();
        return;

      default: {
        // Exhaustiveness check
        const _never: never = action;
        console.warn("Unknown action", _never);
      }
    }
  };

  return (
    <div style={styles.backdrop} onMouseDown={onBackdropClick} role="presentation">
      {/* Stop propagation so clicks inside don't close */}
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Optional banner */}
        {spec.header.banner && (
          <div style={styles.banner}>
            <AssetImage asset={spec.header.banner} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            {spec.header.icon && (
              <AssetImage asset={spec.header.icon} style={{ width: 28, height: 28, borderRadius: 8 }} />
            )}
            <div>
              <div style={styles.title}>{spec.header.title}</div>
              {spec.header.subtitle && <div style={styles.subtitle}>{spec.header.subtitle}</div>}
            </div>
          </div>

          {spec.dismiss.x && (
            <button style={styles.closeButton} onClick={onXClick} aria-label="Close">
              ✕
            </button>
          )}
        </div>

        {/* Body */}
        <div style={styles.body}>
          {spec.body.map((block, idx) => (
            <BlockRenderer key={`${spec.id}_b_${idx}`} block={block} />
          ))}
        </div>

        {/* Buttons */}
        <div style={styles.footer}>
          {spec.buttons.map((b) => (
            <ModalButton key={b.id} spec={b} onClick={() => dispatchActionWithConfirm(b, dispatchAction)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// -------------------------
// Confirm handling
// -------------------------
async function dispatchActionWithConfirm(button: ButtonSpec, dispatch: (a: Action) => Promise<void>) {
  if (!button.requiresConfirm) return dispatch(button.action);

  const confirmed = window.confirm(button.requiresConfirm.title);
  if (!confirmed) return;
  return dispatch(button.action);
}

// -------------------------
// Block renderer registry
// -------------------------
function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "richText":
      return <RichText doc={block.doc} />;

    case "divider":
      return <div style={styles.divider} />;

    case "image":
      return (
        <div style={{ margin: "12px 0" }}>
          <AssetImage asset={block.image} style={{ width: "100%", borderRadius: 12 }} />
          {block.caption && <div style={styles.caption}>{block.caption}</div>}
        </div>
      );

    case "metaRows":
      return (
        <div style={styles.metaRows}>
          {block.rows.map((r, i) => (
            <div key={i} style={styles.metaRow}>
              <div style={styles.metaLabel}>{r.label}</div>
              <div style={styles.metaValue}>{r.value}</div>
            </div>
          ))}
        </div>
      );

    case "timer":
      return <Timer endsAt={block.endsAt} label={block.label} />;

    case "rewardsPreview":
      return <RewardsList items={block.items} title="Preview" compact />;

    case "rewardsList":
      return <RewardsList items={block.items} title={block.title ?? "Rewards"} />;

    case "error":
      return <div style={styles.error}>{block.message}</div>;

    default: {
      const _never: never = block;
      return null;
    }
  }
}

// -------------------------
// Rich text renderer (safe AST)
// -------------------------
function RichText({ doc }: { doc: RichTextDoc }) {
  return (
    <div style={styles.richText}>
      {doc.map((n, i) => (
        <RichNode key={i} node={n} />
      ))}
    </div>
  );
}

function RichNode({ node }: { node: RichTextNode }) {
  switch (node.t) {
    case "text":
      return <>{node.v}</>;
    case "br":
      return <br />;

    case "p":
      return <p style={styles.p}>{node.c.map((c, i) => <RichNode key={i} node={c} />)}</p>;
    case "h1":
      return <h1 style={styles.h1}>{node.c.map((c, i) => <RichNode key={i} node={c} />)}</h1>;
    case "h2":
      return <h2 style={styles.h2}>{node.c.map((c, i) => <RichNode key={i} node={c} />)}</h2>;

    case "ul":
      return <ul style={styles.ul}>{node.c.map((c, i) => <RichNode key={i} node={c} />)}</ul>;
    case "li":
      return <li style={styles.li}>{node.c.map((c, i) => <RichNode key={i} node={c} />)}</li>;

    case "strong":
      return <strong>{node.c.map((c, i) => <RichNode key={i} node={c} />)}</strong>;
    case "em":
      return <em>{node.c.map((c, i) => <RichNode key={i} node={c} />)}</em>;
    case "code":
      return <code style={styles.codeInline}>{node.c.map((c, i) => <RichNode key={i} node={c} />)}</code>;

    case "link":
      return (
        <a href={node.href} target="_blank" rel="noreferrer" style={styles.link}>
          {node.c.map((c, i) => <RichNode key={i} node={c} />)}
        </a>
      );

    case "token":
      // Ideally resolved server-side. Client can show nothing or a placeholder.
      return <span style={styles.token}>{`{${node.key}}`}</span>;

    default: {
      const _never: never = node;
      return null;
    }
  }
}

// -------------------------
// Small components
// -------------------------
function RewardsList({ items, title, compact }: { items: RewardItem[]; title: string; compact?: boolean }) {
  const display = compact ? items.slice(0, 5) : items;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={styles.sectionTitle}>{title}</div>
      <div style={styles.rewardsGrid}>
        {display.map((it, idx) => (
          <div key={idx} style={styles.rewardCard}>
            {it.assetKey ? (
              <div style={styles.rewardIcon}>
                <AssetImage asset={{ assetKey: it.assetKey }} style={{ width: 32, height: 32 }} />
              </div>
            ) : (
              <div style={styles.rewardIconPlaceholder} />
            )}
            <div style={{ flex: 1 }}>
              <div style={styles.rewardName}>
                {it.name}
                {typeof it.qty === "number" && it.qty > 0 ? ` ×${it.qty}` : ""}
              </div>
              {it.note && <div style={styles.rewardNote}>{it.note}</div>}
            </div>
          </div>
        ))}
      </div>
      {compact && items.length > display.length && <div style={styles.caption}>+{items.length - display.length} more</div>}
    </div>
  );
}

function Timer({ endsAt, label }: { endsAt: string; label?: string }) {
  const endMs = useMemo(() => Date.parse(endsAt), [endsAt]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const remaining = Math.max(0, endMs - now);
  const s = Math.floor(remaining / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;

  return (
    <div style={styles.timer}>
      <div style={styles.metaLabel}>{label ?? "Time remaining"}</div>
      <div style={styles.timerValue}>
        {mm}:{ss.toString().padStart(2, "0")}
      </div>
    </div>
  );
}

function ModalButton({ spec, onClick }: { spec: ButtonSpec; onClick: () => void }) {
  const base = styles.buttonBase;
  const variant =
    spec.variant === "primary"
      ? styles.buttonPrimary
      : spec.variant === "danger"
        ? styles.buttonDanger
        : spec.variant === "ghost"
          ? styles.buttonGhost
          : styles.buttonSecondary;

  return (
    <button
      style={{ ...base, ...variant, opacity: spec.disabled ? 0.5 : 1, cursor: spec.disabled ? "not-allowed" : "pointer" }}
      onClick={spec.disabled ? undefined : onClick}
    >
      {spec.label}
    </button>
  );
}

// Asset loader stub: wire this to your CDN / asset atlas / local bundle.
function AssetImage({ asset, style }: { asset: AssetRef; style?: React.CSSProperties }) {
  const src = assetKeyToUrl(asset.assetKey);
  return <img src={src} alt={asset.alt ?? ""} style={style} />;
}

function assetKeyToUrl(assetKey: string) {
  // Replace with your real mapping strategy:
  // - CDN: https://cdn.perps.game/assets/{assetKey}.png
  // - Or local: require() / import maps
  return `/assets/${assetKey}.png`;
}

// -------------------------
// Basic inline styles (replace with your design system)
// -------------------------
const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1000
  },
  modal: {
    width: "min(560px, 100%)",
    background: "#0f1014",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)"
  },
  banner: { width: "100%", height: 140, overflow: "hidden" },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
    borderBottom: "1px solid rgba(255,255,255,0.08)"
  },
  headerLeft: { display: "flex", gap: 12, alignItems: "center" },
  title: { fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.92)" },
  subtitle: { fontSize: 13, marginTop: 4, color: "rgba(255,255,255,0.65)" },
  closeButton: {
    background: "transparent",
    color: "rgba(255,255,255,0.7)",
    border: "none",
    fontSize: 18,
    lineHeight: "18px",
    padding: 6,
    cursor: "pointer"
  },
  body: { padding: 16 },
  footer: {
    display: "flex",
    gap: 12,
    padding: 16,
    borderTop: "1px solid rgba(255,255,255,0.08)",
    justifyContent: "flex-end",
    flexWrap: "wrap"
  },
  divider: { height: 1, background: "rgba(255,255,255,0.08)", margin: "12px 0" },
  caption: { fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 8 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 8 },

  richText: { color: "rgba(255,255,255,0.82)" },
  p: { margin: "0 0 10px 0", lineHeight: 1.45 },
  h1: { margin: "6px 0 10px 0", fontSize: 20, fontWeight: 800 },
  h2: { margin: "6px 0 10px 0", fontSize: 16, fontWeight: 800 },
  ul: { margin: "0 0 10px 18px" },
  li: { margin: "4px 0" },
  codeInline: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    padding: "2px 6px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.08)"
  },
  link: { color: "rgba(120,180,255,0.95)" },
  token: { opacity: 0.6 },

  metaRows: {
    marginTop: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    overflow: "hidden"
  },
  metaRow: { display: "flex", justifyContent: "space-between", padding: "10px 12px", gap: 12 },
  metaLabel: { fontSize: 12, color: "rgba(255,255,255,0.6)" },
  metaValue: { fontSize: 12, color: "rgba(255,255,255,0.88)" },

  timer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    marginTop: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)"
  },
  timerValue: { fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.92)" },

  rewardsGrid: { display: "grid", gap: 8 },
  rewardCard: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)"
  },
  rewardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: "rgba(255,255,255,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  rewardIconPlaceholder: { width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.06)" },
  rewardName: { fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" },
  rewardNote: { fontSize: 12, marginTop: 2, color: "rgba(255,255,255,0.6)" },

  buttonBase: {
    minWidth: 120,
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 13,
    fontWeight: 800
  },
  buttonPrimary: { background: "rgba(255,255,255,0.92)", color: "#0f1014" },
  buttonSecondary: { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.9)" },
  buttonGhost: { background: "transparent", color: "rgba(255,255,255,0.9)" },
  buttonDanger: { background: "rgba(255,80,80,0.2)", color: "rgba(255,140,140,0.95)", border: "1px solid rgba(255,80,80,0.35)" },

  error: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,80,80,0.35)",
    background: "rgba(255,80,80,0.12)",
    color: "rgba(255,210,210,0.95)"
  }
};