// Parses AddressSanitizer / UBSan reports out of a run's stderr so the
// OutputConsole can render a structured summary card above the raw output.
// The card is an aid to reading the report, not a replacement for it —
// the raw text stays one click away in a collapsible.

export interface SanitizerReport {
  kind: 'ASan' | 'UBSan' | 'ASan+UBSan';
  errorClass: string | null; // e.g. "heap-buffer-overflow", "signed integer overflow"
  location: string | null; // top faulting file:line, e.g. "main.c:9"
}

export function parseSanitizerReport(stderr: string | null): SanitizerReport | null {
  if (!stderr) return null;
  const hasASan = stderr.includes('AddressSanitizer');
  const hasUBSan = stderr.includes('runtime error:');
  if (!hasASan && !hasUBSan) return null;

  const kind = hasASan && hasUBSan ? 'ASan+UBSan' : hasASan ? 'ASan' : 'UBSan';

  let errorClass: string | null = null;
  if (hasASan) {
    // "==123==ERROR: AddressSanitizer: heap-buffer-overflow on address …"
    const m = /AddressSanitizer: ([a-z][\w-]*)/i.exec(stderr);
    if (m) errorClass = m[1];
  }
  if (errorClass === null && hasUBSan) {
    // "main.c:9:12: runtime error: signed integer overflow: …"
    const m = /runtime error: ([^:\n]+)/.exec(stderr);
    if (m) errorClass = m[1].trim();
  }

  let location: string | null = null;
  if (hasASan) {
    // Top stack frame: "    #0 0x… in main /path/main.c:9:12" (column optional)
    const m = /#0\s+\S+\s+in\s+\S+\s+([^\s()]+\.[A-Za-z]+):(\d+)/.exec(stderr);
    if (m) location = `${m[1].split('/').pop()}:${m[2]}`;
  }
  if (location === null && hasUBSan) {
    // UBSan lines are prefixed with the faulting location: "main.c:9:12: runtime error: …"
    const m = /([^\s()]+\.[A-Za-z]+):(\d+):\d+: runtime error:/.exec(stderr);
    if (m) location = `${m[1].split('/').pop()}:${m[2]}`;
  }

  return { kind, errorClass, location };
}
