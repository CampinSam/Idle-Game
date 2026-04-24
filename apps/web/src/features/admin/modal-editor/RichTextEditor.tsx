import { useEffect, useRef, useState, useCallback } from 'react';
import type { RichTextDoc, RichTextNode } from '@derp/shared';

interface Props {
  doc: RichTextDoc;
  onChange: (doc: RichTextDoc) => void;
  /** Optional list of token paths the user can insert via the toolbar. */
  tokenPaths?: string[];
}

// Parse DOM into RichTextDoc. Maps <b>→strong and <i>→em so execCommand output is normalized.
function domNodesToDoc(nodes: NodeList): RichTextNode[] {
  return Array.from(nodes).flatMap((n): RichTextNode[] => {
    if (n.nodeType === Node.TEXT_NODE) {
      const v = n.textContent || '';
      return v ? [{ t: 'text', v }] : [];
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return [];
    const el = n as Element;
    let tag = el.tagName.toLowerCase();
    if (tag === 'b') tag = 'strong';
    if (tag === 'i') tag = 'em';
    if (tag === 'div') {
      // execCommand emits stray divs (e.g. for line breaks) — flatten.
      const inner = domNodesToDoc(el.childNodes);
      return inner.length > 0 ? [{ t: 'p', c: inner }] : [];
    }
    const c = domNodesToDoc(el.childNodes);
    if (tag === 'br') return [{ t: 'br' }];
    if (tag === 'a') return [{ t: 'link', href: el.getAttribute('href') || '', c }];
    if (['p', 'h1', 'h2', 'ul', 'li', 'strong', 'em', 'code'].includes(tag)) {
      return [{ t: tag as 'p', c }];
    }
    // Unknown wrapper — flatten its content.
    return c;
  });
}

function htmlToDoc(html: string): RichTextDoc {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return domNodesToDoc(doc.body.childNodes);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Strip dangerous URL schemes; allow http(s), mailto, tel, plus relative/anchor links.
function sanitizeHref(raw: string): string {
  const noCtrl = (raw || '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
  if (!noCtrl) return '';
  if (/^(javascript|data|vbscript|file):/i.test(noCtrl)) return '';
  return noCtrl;
}

function nodeToHtml(n: RichTextNode): string {
  if (n.t === 'text') return escapeHtml(n.v);
  if (n.t === 'br') return '<br>';
  if (n.t === 'token') return `\${${n.key}}`;
  if (n.t === 'link') {
    const safeHref = sanitizeHref(n.href);
    const inner = n.c.map(nodeToHtml).join('');
    if (!safeHref) return inner; // drop unsafe links, keep text
    return `<a href="${escapeAttr(safeHref)}">${inner}</a>`;
  }
  return `<${n.t}>${n.c.map(nodeToHtml).join('')}</${n.t}>`;
}

function docToHtml(doc: RichTextDoc): string {
  return doc.map(nodeToHtml).join('') || '<p><br></p>';
}

export default function RichTextEditor({ doc, onChange, tokenPaths }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);
  const tokenWrapRef = useRef<HTMLDivElement>(null);

  // Close the token picker on Escape or click outside it.
  useEffect(() => {
    if (!tokenPickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTokenPickerOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && tokenWrapRef.current && !tokenWrapRef.current.contains(t)) setTokenPickerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [tokenPickerOpen]);

  // Last emitted doc (stringified). When the incoming prop matches, skip
  // touching the DOM so the caret isn't clobbered during typing.
  const lastEmittedRef = useRef<string>('');

  // Sync prop → DOM only when the doc actually differs from what we emitted.
  useEffect(() => {
    if (!ref.current) return;
    const incoming = JSON.stringify(doc);
    if (incoming === lastEmittedRef.current) return;
    ref.current.innerHTML = docToHtml(doc);
    lastEmittedRef.current = incoming;
  }, [doc]);

  // When entering JSON view, snapshot current doc as text.
  useEffect(() => {
    if (showJson) {
      setJsonText(JSON.stringify(doc, null, 2));
      setJsonError('');
    }
  }, [showJson, doc]);

  const emit = useCallback(() => {
    if (!ref.current) return;
    const next = htmlToDoc(ref.current.innerHTML);
    lastEmittedRef.current = JSON.stringify(next);
    onChange(next);
  }, [onChange]);

  const exec = useCallback((cmd: string, value?: string) => {
    if (!ref.current) return;
    ref.current.focus();
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(cmd, false, value);
    emit();
  }, [emit]);

  const formatBlock = useCallback((tag: string) => {
    exec('formatBlock', tag);
  }, [exec]);

  const wrapInCode = useCallback(() => {
    if (!ref.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const code = document.createElement('code');
    try {
      code.appendChild(range.extractContents());
      range.insertNode(code);
      sel.removeAllRanges();
      const r2 = document.createRange();
      r2.selectNodeContents(code);
      sel.addRange(r2);
      emit();
    } catch {
      /* selection spans non-text nodes — ignore */
    }
  }, [emit]);

  const insertLink = useCallback(() => {
    const url = window.prompt('Link URL', 'https://');
    if (!url) return;
    const safe = sanitizeHref(url);
    if (!safe) {
      window.alert('Only http(s), mailto, tel, and relative links are allowed.');
      return;
    }
    exec('createLink', safe);
  }, [exec]);

  const insertTextAtCursor = useCallback((text: string) => {
    if (!ref.current) return;
    ref.current.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      ref.current.appendChild(document.createTextNode(text));
    }
    emit();
  }, [emit]);

  const insertToken = useCallback((path: string) => {
    insertTextAtCursor(`\${${path}}`);
    setTokenPickerOpen(false);
  }, [insertTextAtCursor]);

  const tryApplyJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error('Must be a JSON array of nodes.');
      onChange(parsed);
      if (ref.current) ref.current.innerHTML = docToHtml(parsed);
      setJsonError('');
      setShowJson(false);
    } catch (e: any) {
      setJsonError(e.message || 'Invalid JSON');
    }
  };

  const cancelJson = () => {
    setJsonError('');
    setShowJson(false);
  };

  return (
    <div className="me-rte">
      {!showJson && (
        <div className="me-rte-toolbar">
          <button type="button" className="me-rte-btn" onClick={() => formatBlock('p')} title="Paragraph">P</button>
          <button type="button" className="me-rte-btn" onClick={() => formatBlock('h1')} title="Heading 1">H1</button>
          <button type="button" className="me-rte-btn" onClick={() => formatBlock('h2')} title="Heading 2">H2</button>
          <span className="me-rte-sep" />
          <button type="button" className="me-rte-btn" onClick={() => exec('bold')} title="Bold"><b>B</b></button>
          <button type="button" className="me-rte-btn" onClick={() => exec('italic')} title="Italic"><i>I</i></button>
          <button type="button" className="me-rte-btn" onClick={wrapInCode} title="Code"><code>{'<>'}</code></button>
          <span className="me-rte-sep" />
          <button type="button" className="me-rte-btn" onClick={() => exec('insertUnorderedList')} title="Bullet list">• ≡</button>
          <button type="button" className="me-rte-btn" onClick={insertLink} title="Link">🔗</button>
          <span className="me-rte-sep" />
          <div ref={tokenWrapRef} className="me-rte-token-wrap">
            <button
              type="button"
              className="me-rte-btn me-rte-btn-token"
              onClick={() => setTokenPickerOpen(o => !o)}
              title="Insert token"
            >
              ${'{…}'}
            </button>
            {tokenPickerOpen && (
              <div className="me-rte-token-menu">
                <div className="me-rte-token-menu-hdr">Insert token</div>
                {tokenPaths && tokenPaths.length > 0 ? (
                  tokenPaths.map(p => (
                    <button key={p} type="button" className="me-rte-token-opt" onClick={() => insertToken(p)}>
                      {`\${${p}}`}
                    </button>
                  ))
                ) : (
                  <div className="me-rte-token-empty">Paste a sample payload in the Payload section to see suggestions.</div>
                )}
                <div className="me-rte-token-custom">
                  <button
                    type="button"
                    className="me-rte-token-opt"
                    onClick={() => {
                      const p = window.prompt('Token path', 'results.message');
                      if (p) insertToken(p.trim());
                    }}
                  >
                    + Custom path…
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className="me-rte-btn me-rte-btn-json"
            onClick={() => setShowJson(true)}
            title="View raw JSON"
          >
            { } JSON
          </button>
        </div>
      )}

      {!showJson && (
        <div
          ref={ref}
          className="me-rte-area"
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          spellCheck
        />
      )}

      {showJson && (
        <div className="me-rte-json">
          <textarea
            className="me-rte-json-text"
            value={jsonText}
            onChange={e => { setJsonText(e.target.value); setJsonError(''); }}
            spellCheck={false}
          />
          {jsonError && <div className="me-rte-json-err">{jsonError}</div>}
          <div className="me-rte-json-actions">
            <button type="button" className="me-btn-ghost" onClick={cancelJson}>Cancel</button>
            <button type="button" className="me-btn-primary" onClick={tryApplyJson}>Apply JSON</button>
          </div>
        </div>
      )}

      <div className="me-rte-hint">
        Tokens: type or insert <code>{'${path}'}</code> anywhere — they\u2019re replaced from the payload at render time.
      </div>
    </div>
  );
}
