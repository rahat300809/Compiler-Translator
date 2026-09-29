/**
 * Error pattern detector for all major programming languages.
 * Parses terminal output and extracts structured error information.
 */

export interface DetectedError {
  raw: string;           // Full raw error text
  language: string;      // Detected language
  errorType: string;     // e.g., "SyntaxError", "NullPointerException"
  file?: string;         // File where error occurred
  line?: number;         // Line number
  column?: number;       // Column number
  message: string;       // Core error message
  stackTrace?: string;   // Full stack trace if available
  severity: 'error' | 'warning' | 'fatal';
}

// ─── Language-specific error patterns ────────────────────────────────────────

const ERROR_PATTERNS: Array<{
  language: string;
  patterns: RegExp[];
  extractors: {
    errorType?: RegExp;
    file?: RegExp;
    line?: RegExp;
    message?: RegExp;
  };
}> = [
  // ── Python ──────────────────────────────────────────────────────────────────
  {
    language: 'Python',
    patterns: [
      /Traceback \(most recent call last\)/,
      /\b(SyntaxError|IndentationError|NameError|TypeError|ValueError|AttributeError|ImportError|ModuleNotFoundError|IndexError|KeyError|ZeroDivisionError|RuntimeError|RecursionError|StopIteration|OverflowError|MemoryError|OSError|FileNotFoundError|PermissionError|TimeoutError)\b/,
    ],
    extractors: {
      errorType: /(\w+Error|\w+Exception|SyntaxError|IndentationError):/,
      file: /File "([^"]+)"/,
      line: /line (\d+)/,
      message: /(?:\w+Error|\w+Exception|SyntaxError): (.+)/
    }
  },

  // ── JavaScript / Node.js ────────────────────────────────────────────────────
  {
    language: 'JavaScript',
    patterns: [
      /\b(ReferenceError|TypeError|SyntaxError|RangeError|URIError|EvalError|Error)\b.*\n.*at /,
      /node:internal\/|at Object\.<anonymous>|at Module\._compile/,
      /UnhandledPromiseRejection|UnhandledPromiseRejectionWarning/,
    ],
    extractors: {
      errorType: /(ReferenceError|TypeError|SyntaxError|RangeError|Error):/,
      file: /at .+\((.+\.(?:js|ts|mjs|cjs)):\d+:\d+\)/,
      line: /:(\d+):\d+\)/,
      message: /(?:Error|Exception): (.+)/
    }
  },

  // ── TypeScript ──────────────────────────────────────────────────────────────
  {
    language: 'TypeScript',
    patterns: [
      /error TS\d+:/,
      /\.ts\(\d+,\d+\): error/,
    ],
    extractors: {
      errorType: /error (TS\d+):/,
      file: /(.+\.ts)\(\d+,\d+\)/,
      line: /\.ts\((\d+),\d+\)/,
      message: /error TS\d+: (.+)/
    }
  },

  // ── Java ────────────────────────────────────────────────────────────────────
  {
    language: 'Java',
    patterns: [
      /Exception in thread|\.java:\d+: error:/,
      /\b(NullPointerException|ArrayIndexOutOfBoundsException|ClassCastException|StackOverflowError|OutOfMemoryError|IllegalArgumentException|IllegalStateException|NumberFormatException|IOException|SQLException)\b/,
    ],
    extractors: {
      errorType: /(\w+Exception|\w+Error)$/m,
      file: /(\w+\.java):\d+/,
      line: /\.java:(\d+)/,
      message: /Exception in thread "\w+" (.+)/
    }
  },

  // ── C / C++ ─────────────────────────────────────────────────────────────────
  {
    language: 'C/C++',
    patterns: [
      /\.(?:c|cpp|cc|cxx|h|hpp):\d+:\d+: (?:error|warning|fatal error):/,
      /undefined reference to/,
      /Segmentation fault|SIGSEGV|SIGABRT/,
      /ld: cannot find|linker command failed/,
    ],
    extractors: {
      errorType: /(error|warning|fatal error):/,
      file: /([^\s]+\.(?:c|cpp|cc|cxx|h|hpp)):\d+/,
      line: /\.(?:c|cpp|cc|cxx|h|hpp):(\d+):\d+/,
      message: /(?:error|warning|fatal error): (.+)/
    }
  },

  // ── C# ──────────────────────────────────────────────────────────────────────
  {
    language: 'C#',
    patterns: [
      /CS\d{4}:/,
      /\.cs\(\d+,\d+\)/,
      /\b(NullReferenceException|ArgumentNullException|InvalidOperationException|StackOverflowException|OutOfMemoryException)\b/,
    ],
    extractors: {
      errorType: /(CS\d{4})/,
      file: /([^\s]+\.cs)\(\d+,\d+\)/,
      line: /\.cs\((\d+),\d+\)/,
      message: /CS\d{4}: (.+)/
    }
  },

  // ── Rust ────────────────────────────────────────────────────────────────────
  {
    language: 'Rust',
    patterns: [
      /^error\[E\d+\]:/m,
      /^error: /m,
      /cannot borrow|does not live long enough|mismatched types/,
    ],
    extractors: {
      errorType: /error\[(E\d+)\]/,
      file: /-->\s+([^\s]+\.rs):\d+/,
      line: /-->\s+[^\s]+\.rs:(\d+)/,
      message: /error(?:\[E\d+\])?: (.+)/
    }
  },

  // ── Go ──────────────────────────────────────────────────────────────────────
  {
    language: 'Go',
    patterns: [
      /\.go:\d+:\d+: /,
      /panic: |goroutine \d+ \[/,
    ],
    extractors: {
      errorType: /panic: (\w+)/,
      file: /([^\s]+\.go):\d+/,
      line: /\.go:(\d+):\d+/,
      message: /\.go:\d+:\d+: (.+)/
    }
  },

  // ── PHP ─────────────────────────────────────────────────────────────────────
  {
    language: 'PHP',
    patterns: [
      /Parse error:|Fatal error:|Warning:|Notice:/,
      /in \/.*\.php on line \d+/,
    ],
    extractors: {
      errorType: /(Parse error|Fatal error|Warning|Notice)/,
      file: /in (\/[^\s]+\.php)/,
      line: /on line (\d+)/,
      message: /(Parse error|Fatal error|Warning|Notice): (.+)/
    }
  },

  // ── Ruby ────────────────────────────────────────────────────────────────────
  {
    language: 'Ruby',
    patterns: [
      /\.rb:\d+:in/,
      /\b(NoMethodError|NameError|TypeError|ArgumentError|RuntimeError|SyntaxError|LoadError|Errno::)\b/,
    ],
    extractors: {
      errorType: /(\w+Error|\w+Exception|SyntaxError):/,
      file: /([^\s]+\.rb):\d+/,
      line: /\.rb:(\d+)/,
      message: /\w+Error: (.+)/
    }
  },

  // ── Kotlin ──────────────────────────────────────────────────────────────────
  {
    language: 'Kotlin',
    patterns: [
      /error: .*\.kt:\(\d+,\d+\)/,
      /\b(KotlinNullPointerException|IllegalStateException)\b/,
    ],
    extractors: {
      errorType: /(error)/,
      file: /([^\s]+\.kt)/,
      line: /\.kt:\((\d+),/,
      message: /error: (.+)/
    }
  },

  // ── Generic fallback ────────────────────────────────────────────────────────
  {
    language: 'Unknown',
    patterns: [
      /\b(error|Error|ERROR|exception|Exception|EXCEPTION|failed|FAILED|fatal|FATAL)\b/i,
      /exit code [1-9]/i,
      /Process finished with exit code [^0]/
    ],
    extractors: {
      message: /(?:error|Error|ERROR|exception|Exception): (.+)/i
    }
  }
];

// ─── Core detection logic ─────────────────────────────────────────────────────

export function detectErrors(terminalOutput: string): DetectedError[] {
  const errors: DetectedError[] = [];
  const lines = terminalOutput.split('\n');

  // Split output into chunks around error boundaries
  const errorChunks = splitIntoErrorChunks(terminalOutput);

  for (const chunk of errorChunks) {
    const detected = parseErrorChunk(chunk, lines);
    if (detected) {
      errors.push(detected);
    }
  }

  // Deduplicate
  return deduplicateErrors(errors);
}

function splitIntoErrorChunks(output: string): string[] {
  const chunkBoundaries = [
    /^Traceback \(most recent call last\)/m,
    /^Exception in thread/m,
    /^error\[E\d+\]:/m,
    /^(?:Parse|Fatal) error:/m,
    /^panic:/m,
  ];

  let chunks: string[] = [output];

  for (const boundary of chunkBoundaries) {
    const newChunks: string[] = [];
    for (const chunk of chunks) {
      const parts = chunk.split(boundary);
      if (parts.length > 1) {
        newChunks.push(parts[0]);
        for (let i = 1; i < parts.length; i++) {
          newChunks.push(parts[i]);
        }
      } else {
        newChunks.push(chunk);
      }
    }
    chunks = newChunks;
  }

  return chunks.filter(c => c.trim().length > 0);
}

function parseErrorChunk(chunk: string, _allLines: string[]): DetectedError | null {
  for (const langPattern of ERROR_PATTERNS) {
    const matched = langPattern.patterns.some(p => p.test(chunk));
    if (!matched) { continue; }

    const { extractors } = langPattern;

    const errorTypeMatch = extractors.errorType ? chunk.match(extractors.errorType) : null;
    const fileMatch = extractors.file ? chunk.match(extractors.file) : null;
    const lineMatch = extractors.line ? chunk.match(extractors.line) : null;
    const messageMatch = extractors.message ? chunk.match(extractors.message) : null;

    const message = messageMatch ? messageMatch[1] || messageMatch[0] : chunk.split('\n')[0];

    // Determine severity
    let severity: 'error' | 'warning' | 'fatal' = 'error';
    if (/warning/i.test(chunk) && !/error/i.test(chunk)) { severity = 'warning'; }
    if (/fatal|crash|SIGSEGV|SIGABRT|segfault/i.test(chunk)) { severity = 'fatal'; }

    // Trim raw to reasonable length
    const raw = chunk.trim().slice(0, 2000);

    return {
      raw,
      language: langPattern.language,
      errorType: errorTypeMatch ? errorTypeMatch[1] : 'Error',
      file: fileMatch ? fileMatch[1] : undefined,
      line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      message: message.trim().slice(0, 500),
      stackTrace: chunk.includes('\n') ? chunk : undefined,
      severity
    };
  }

  return null;
}

function deduplicateErrors(errors: DetectedError[]): DetectedError[] {
  const seen = new Set<string>();
  return errors.filter(e => {
    const key = `${e.language}:${e.errorType}:${e.message.slice(0, 80)}`;
    if (seen.has(key)) { return false; }
    seen.add(key);
    return true;
  });
}

export function hasErrors(text: string): boolean {
  return ERROR_PATTERNS.some(lp => lp.patterns.some(p => p.test(text)));
}

export function extractCodeContext(
  filePath: string | undefined,
  errorLine: number | undefined,
  contextLines: number = 5
): string {
  if (!filePath || !errorLine) { return ''; }

  try {
    const fs = require('fs');
    if (!fs.existsSync(filePath)) { return ''; }

    const content = fs.readFileSync(filePath, 'utf-8') as string;
    const lines = content.split('\n');
    const start = Math.max(0, errorLine - contextLines - 1);
    const end = Math.min(lines.length, errorLine + contextLines);

    return lines
      .slice(start, end)
      .map((l: string, i: number) => `${start + i + 1}${start + i + 1 === errorLine ? ' → ' : '   '}${l}`)
      .join('\n');
  } catch {
    return '';
  }
}
