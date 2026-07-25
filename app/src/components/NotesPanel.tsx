import { useEffect, useRef, useState } from 'react';
import { StickyNote } from 'lucide-react';
import { getNote, saveNote } from '@/lib/notes';

interface NotesPanelProps {
  moduleId: string;
}

/** Free-form per-module notes, autosaved to localStorage (debounced).
 * Rendered with key={moduleId} by the parent, so switching modules remounts
 * and re-initializes state — no reset effect needed. */
export function NotesPanel({ moduleId }: NotesPanelProps) {
  const [text, setText] = useState(() => getNote(moduleId));
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function handleChange(value: string) {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveNote(moduleId, value);
      setSavedAt(new Date());
    }, 500);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Notes
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {savedAt ? `saved ${savedAt.toLocaleTimeString()}` : 'autosaves as you type'}
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="What did this module actually teach you? Gotchas, mental models, things to re-check…"
        className="min-h-0 flex-1 resize-none bg-background px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}
