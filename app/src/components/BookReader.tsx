import { isValidElement, useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';
import type { ModuleContent } from '@/types/api';

// ---------------------------------------------------------------------------
// Markdown element renderers — styled as a calm book page (see .book-reader
// in index.css for the base typography; code blocks and tables get dedicated
// treatment here).
// ---------------------------------------------------------------------------

function extractLanguage(children: ReactNode): string | null {
  if (isValidElement<{ className?: string }>(children)) {
    const cls = children.props.className ?? '';
    const match = /language-([\w+-]+)/.exec(cls);
    if (match) return match[1];
  }
  return null;
}

const markdownComponents = {
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

// ---------------------------------------------------------------------------

interface BookReaderProps {
  moduleId: string | null;
}

export function BookReader({ moduleId }: BookReaderProps) {
  const [content, setContent] = useState<ModuleContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!moduleId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getModule(moduleId)
      .then((c) => {
        if (!cancelled) setContent(c);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setContent(null);
          setError(e instanceof Error ? e.message : 'failed to load module');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <article className="book-reader mx-auto max-w-3xl px-8 py-10">
        {loading && <p className="text-sm text-muted-foreground">Opening the book…</p>}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Could not load this module: {error}. Is the backend running on port 4747?
          </div>
        )}
        {content && !loading && (
          <>
            <header className="book-reader-header">
              <p className="book-reader-kicker">Book I — C: The Machine Model</p>
              <h1>{content.title}</h1>
            </header>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content.markdown}
            </ReactMarkdown>
          </>
        )}
      </article>
    </div>
  );
}
