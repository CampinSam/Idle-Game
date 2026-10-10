import { useEffect, useRef, useState, useCallback } from 'react';
import { sanitizeHref, type RichTextDoc, type RichTextNode } from '@derp/shared';

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
    <div className="flex flex-col border border-[#2a2a4e] rounded-[8px] bg-[#0a0a1e] overflow-hidden">
      {!showJson && (
        <div className="me-rte-toolbar flex flex-wrap items-center gap-1 px-2 py-[6px] bg-[#0f0f2e] border-b border-[#1a1a3e] sticky top-0 z-[5]">
          <button type="button" className="me-rte-btn min-w-[32px] min-h-[32px] px-2 py-1 bg-transparent border border-transparent rounded-[4px] text-[#cbd5e1] font-[inherit] text-xs cursor-pointer inline-flex items-center justify-center transition-[background,color,border-color] hover:bg-[#1a1a3e] hover:text-[#e0e0ff]" onClick={() => formatBlock('p')} title="Paragraph">P</button>
          <button type="button" className="me-rte-btn min-w-[32px] min-h-[32px] px-2 py-1 bg-transparent border border-transparent rounded-[4px] text-[#cbd5e1] font-[inherit] text-xs cursor-pointer inline-flex items-center justify-center transition-[background,color,border-color] hover:bg-[#1a1a3e] hover:text-[#e0e0ff]" onClick={() => formatBlock('h1')} title="Heading 1">H1</button>
          <button type="button" className="me-rte-btn min-w-[32px] min-h-[32px] px-2 py-1 bg-transparent border border-transparent rounded-[4px] text-[#cbd5e1] font-[inherit] text-xs cursor-pointer inline-flex items-center justify-center transition-[background,color,border-color] hover:bg-[#1a1a3e] hover:text-[#e0e0ff]" onClick={() => formatBlock('h2')} title="Heading 2">H2</button>
          <span className="w-px h-[18px] bg-[#1a1a3e] mx-1" />
          <button type="button" className="me-rte-btn min-w-[32px] min-h-[32px] px-2 py-1 bg-transparent border border-transparent rounded-[4px] text-[#cbd5e1] font-[inherit] text-xs cursor-pointer inline-flex items-center justify-center transition-[background,color,border-color] hover:bg-[#1a1a3e] hover:text-[#e0e0ff]" onClick={() => exec('bold')} title="Bold"><b>B</b></button>
          <button type="button" className="me-rte-btn min-w-[32px] min-h-[32px] px-2 py-1 bg-transparent border border-transparent rounded-[4px] text-[#cbd5e1] font-[inherit] text-xs cursor-pointer inline-flex items-center justify-center transition-[background,color,border-color] hover:bg-[#1a1a3e] hover:text-[#e0e0ff]" onClick={() => exec('italic')} title="Italic"><i>I</i></button>
          <button type="button" className="me-rte-btn min-w-[32px] min-h-[32px] px-2 py-1 bg-transparent border border-transparent rounded-[4px] text-[#cbd5e1] font-[inherit] text-xs cursor-pointer inline-flex items-center justify-center transition-[background,color,border-color] hover:bg-[#1a1a3e] hover:text-[#e0e0ff]" onClick={wrapInCode} title="Code"><code>{'<>'}</code></button>
          <span className="w-px h-[18px] bg-[#1a1a3e] mx-1" />
          <button type="button" className="me-rte-btn min-w-[32px] min-h-[32px] px-2 py-1 bg-transparent border border-transparent rounded-[4px] text-[#cbd5e1] font-[inherit] text-xs cursor-pointer inline-flex items-center justify-center transition-[background,color,border-color] hover:bg-[#1a1a3e] hover:text-[#e0e0ff]" onClick={() => exec('insertUnorderedList')} title="Bullet list">• ≡</button>
          <button type="button" className="me-rte-btn min-w-[32px] min-h-[32px] px-2 py-1 bg-transparent border border-transparent rounded-[4px] text-[#cbd5e1] font-[inherit] text-xs cursor-pointer inline-flex items-center justify-center transition-[background,color,border-color] hover:bg-[#1a1a3e] hover:text-[#e0e0ff]" onClick={insertLink} title="Link">🔗</button>
          <span className="w-px h-[18px] bg-[#1a1a3e] mx-1" />
          <div ref={tokenWrapRef} className="relative">
            <button
              type="button"
              className="me-rte-btn min-w-[32px] min-h-[32px] px-2 py-1 border border-[#a78bfa44] rounded-[4px] text-[#a78bfa] bg-[#7c3aed18] font-[inherit] text-xs cursor-pointer inline-flex items-center justify-center transition-[background,color,border-color] hover:bg-[#1a1a3e] hover:text-[#e0e0ff]"
              onClick={() => setTokenPickerOpen(o => !o)}
              title="Insert token"
            >
              ${'{…}'}
            </button>
            {tokenPickerOpen && (
              <div className="absolute top-full left-0 z-20 mt-1 min-w-[240px] max-w-[320px] max-h-[280px] overflow-y-auto touch-pan-y bg-[#0a0a1e] border border-[#2a2a4e] rounded-[8px] p-[6px] shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex flex-col gap-[2px]">
                <div className="text-[10px] font-[800] tracking-[0.1em] uppercase text-[#4c4c7a] px-[6px] py-1">Insert token</div>
                {tokenPaths && tokenPaths.length > 0 ? (
                  tokenPaths.map(p => (
                    <button key={p} type="button" className="text-left px-2 py-[6px] bg-transparent border-none rounded-[4px] text-[#c4b5fd] font-mono text-xs cursor-pointer hover:bg-[#7c3aed22] transition-colors" onClick={() => insertToken(p)}>
                      {`\${${p}}`}
                    </button>
                  ))
                ) : (
                  <div className="p-2 text-[11px] text-[#555] italic">Paste a sample payload in the Payload section to see suggestions.</div>
                )}
                <div className="border-t border-[#1a1a3e] mt-1 pt-1">
                  <button
                    type="button"
                    className="text-left px-2 py-[6px] bg-transparent border-none rounded-[4px] text-[#c4b5fd] font-mono text-xs cursor-pointer hover:bg-[#7c3aed22] transition-colors"
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
            className="me-rte-btn ml-auto min-w-[32px] min-h-[32px] px-2 py-1 bg-transparent border border-[#2a2a4e] rounded-[4px] text-[10px] text-[#94a3b8] font-[inherit] cursor-pointer inline-flex items-center justify-center transition-[background,color,border-color] hover:bg-[#1a1a3e] hover:text-[#e0e0ff]"
            onClick={() => setShowJson(true)}
            title="View raw JSON"
          >
            View JSON
          </button>
        </div>
      )}

      {!showJson && (
        <div
          ref={ref}
          className="me-rte-area min-h-[120px] max-h-[360px] overflow-y-auto touch-pan-y px-[14px] py-3 bg-[#06061a] text-[#e2e8f0] text-[14px] leading-[1.6] outline-none"
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          spellCheck
        />
      )}

      {showJson && (
        <div className="flex flex-col">
          <textarea
            className="w-full min-h-[200px] px-3 py-[10px] bg-[#06061a] border-0 text-[#c4b5fd] font-[ui-monospace,monospace] text-xs resize-y outline-none"
            value={jsonText}
            onChange={e => { setJsonText(e.target.value); setJsonError(''); }}
            spellCheck={false}
          />
          {jsonError && <div className="text-[#ef4444] text-[11px] px-3 py-1 bg-[rgba(239,68,68,0.08)]">{jsonError}</div>}
          <div className="flex gap-2 justify-end px-2 py-[6px] border-t border-[#1a1a3e]">
            <button type="button" className="me-btn-ghost" onClick={cancelJson}>Cancel</button>
            <button type="button" className="me-btn-primary" onClick={tryApplyJson}>Apply JSON</button>
          </div>
        </div>
      )}

      <div className="me-rte-hint text-[10px] text-[#4c4c7a] px-[10px] pt-1 pb-[6px] bg-[#0a0a1e] border-t border-[#1a1a3e]">
        Tokens: type or insert <code>{'${path}'}</code> anywhere — they're replaced from the payload at render time.
      </div>
    </div>
  );
}
