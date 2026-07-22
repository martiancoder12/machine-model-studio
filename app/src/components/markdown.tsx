import { isValidElement, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Shared react-markdown element renderers — the calm book-page styling used
// by the reader (BookReader) and the study tabs (LabPanel, BuildTaskPanel).
// Base typography lives in .book-reader* in index.css; code blocks and tables
// get dedicated treatment here.
// ---------------------------------------------------------------------------

function extractLanguage(children: ReactNode): string | null {
  if (isValidElement<{ className?: string }>(children)) {
    const cls = children.props.className ?? '';
    const match = /language-([\w+-]+)/.exec(cls);
    if (match) return match[1];
  }
  return null;
}

export const markdownComponents = {
  pre({ children }: { children?: ReactNode }) {
    const lang = extractLanguage(children);
    return (
      <figure className="book-codeblock">
        <figcaption>
          <span className="book-codeblock-lang">{lang ?? 'text'}</span>
        </figcaption>
        <pre>{children}</pre>
      </figure>
    );
  },
  code({ className, children }: { className?: string; children?: ReactNode }) {
    // Block code is handled by the `pre` renderer above; anything reaching
    // here without a language class is inline code.
    if (className && /language-/.test(className)) {
      return <code className={className}>{children}</code>;
    }
    return <code className="book-inline-code">{children}</code>;
  },
  table({ children }: { children?: ReactNode }) {
    return (
      <div className="book-table-wrap">
        <table>{children}</table>
      </div>
    );
  },
  a({ href, children }: { href?: string; children?: ReactNode }) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
};
