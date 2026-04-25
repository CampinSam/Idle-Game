import { sanitizeHref, type RichTextDoc, type RichTextNode } from '@derp/shared';

export default function RichText({ doc }: { doc: RichTextDoc }) {
  return (
    <div className="gm-rich-text">
      {doc.map((n, i) => (
        <RichNode key={i} node={n} />
      ))}
    </div>
  );
}

function RichNode({ node }: { node: RichTextNode }) {
  switch (node.t) {
    case 'text':
      return <>{node.v}</>;
    case 'br':
      return <br />;
    case 'p':
      return <p className="gm-rt-p">{node.c.map((c, i) => <RichNode key={i} node={c} />)}</p>;
    case 'h1':
      return <h1 className="gm-rt-h1">{node.c.map((c, i) => <RichNode key={i} node={c} />)}</h1>;
    case 'h2':
      return <h2 className="gm-rt-h2">{node.c.map((c, i) => <RichNode key={i} node={c} />)}</h2>;
    case 'ul':
      return <ul className="gm-rt-ul">{node.c.map((c, i) => <RichNode key={i} node={c} />)}</ul>;
    case 'li':
      return <li className="gm-rt-li">{node.c.map((c, i) => <RichNode key={i} node={c} />)}</li>;
    case 'strong':
      return <strong>{node.c.map((c, i) => <RichNode key={i} node={c} />)}</strong>;
    case 'em':
      return <em>{node.c.map((c, i) => <RichNode key={i} node={c} />)}</em>;
    case 'code':
      return <code className="gm-rt-code">{node.c.map((c, i) => <RichNode key={i} node={c} />)}</code>;
    case 'link': {
      const safeHref = sanitizeHref(node.href);
      const inner = node.c.map((c, i) => <RichNode key={i} node={c} />);
      // Drop unsafe links — render the content as plain text instead.
      if (!safeHref) return <>{inner}</>;
      return (
        <a href={safeHref} target="_blank" rel="noreferrer" className="gm-rt-link">
          {inner}
        </a>
      );
    }
    case 'token':
      return <span className="gm-rt-token">{`{${node.key}}`}</span>;
    default: {
      const _never: never = node;
      return null;
    }
  }
}
