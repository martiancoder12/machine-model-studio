import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';
import { markdownComponents } from '@/components/markdown';
import type { ModuleContent } from '@/types/api';

// Markdown element renderers are shared with the study tabs — see
// src/components/markdown.tsx.

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
