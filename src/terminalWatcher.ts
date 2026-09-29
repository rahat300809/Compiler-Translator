/**
 * Terminal Watcher — intercepts VS Code terminal output using the
 * Terminal Write Event API to detect errors in real-time.
 *
 * VS Code's API doesn't allow reading terminal output directly,
 * so we use a TerminalDataWriteEvent listener (VS Code 1.93+) or
 * a PTY-based write interceptor as fallback.
 */

import * as vscode from 'vscode';
import { detectErrors, hasErrors, extractCodeContext, DetectedError } from './errorDetector';

interface BufferedTerminal {
  terminal: vscode.Terminal;
  buffer: string;
  lastActivity: number;
}

const BUFFER_FLUSH_DELAY = 1500; // ms to wait after last output before processing
const MAX_BUFFER_SIZE = 10000;   // chars

export type ErrorCallback = (errors: DetectedError[], rawOutput: string, terminal: vscode.Terminal) => Promise<void>;

export class TerminalWatcher {
  private disposables: vscode.Disposable[] = [];
  private terminalBuffers = new Map<number, BufferedTerminal>();
  private flushTimers = new Map<number, NodeJS.Timeout>();
  private onErrorDetected: ErrorCallback;
  private enabled: boolean = true;

  // Track terminal IDs using a WeakMap-compatible approach
  private terminalIds = new Map<vscode.Terminal, number>();
  private nextId = 1;

  constructor(onErrorDetected: ErrorCallback) {
    this.onErrorDetected = onErrorDetected;
  }

  start(): void {
    // Primary: VS Code Terminal data write event (v1.93+)
    if ('onDidWriteTerminalData' in vscode.window) {
      const watcher = (vscode.window as any).onDidWriteTerminalData(
        (event: { terminal: vscode.Terminal; data: string }) => {
          if (this.enabled) {
            this.handleTerminalData(event.terminal, event.data);
          }
        }
      );
      this.disposables.push(watcher);
    }

    // Track terminal open/close
    this.disposables.push(
      vscode.window.onDidOpenTerminal(terminal => {
        const id = this.getTerminalId(terminal);
        this.terminalBuffers.set(id, {
          terminal,
          buffer: '',
          lastActivity: Date.now()
        });
      })
    );

    this.disposables.push(
      vscode.window.onDidCloseTerminal(terminal => {
        const id = this.getTerminalId(terminal);
        this.terminalBuffers.delete(id);
        const timer = this.flushTimers.get(id);
        if (timer) {
          clearTimeout(timer);
          this.flushTimers.delete(id);
        }
        this.terminalIds.delete(terminal);
      })
    );

    // Initialize existing terminals
    vscode.window.terminals.forEach(terminal => {
      const id = this.getTerminalId(terminal);
      this.terminalBuffers.set(id, {
        terminal,
        buffer: '',
        lastActivity: Date.now()
      });
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private getTerminalId(terminal: vscode.Terminal): number {
    if (!this.terminalIds.has(terminal)) {
      this.terminalIds.set(terminal, this.nextId++);
    }
    return this.terminalIds.get(terminal)!;
  }

  private handleTerminalData(terminal: vscode.Terminal, data: string): void {
    // Skip our own AI explanation terminal
    if (terminal.name.includes('AI Error Explainer')) { return; }

    const id = this.getTerminalId(terminal);
    const stripped = stripAnsi(data);

    // Get or create buffer entry
    let entry = this.terminalBuffers.get(id);
    if (!entry) {
      entry = { terminal, buffer: '', lastActivity: Date.now() };
      this.terminalBuffers.set(id, entry);
    }

    entry.buffer += stripped;
    entry.lastActivity = Date.now();

    // Trim buffer if too large
    if (entry.buffer.length > MAX_BUFFER_SIZE) {
      entry.buffer = entry.buffer.slice(-MAX_BUFFER_SIZE);
    }

    // Debounce: wait for output to settle before analyzing
    const existingTimer = this.flushTimers.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.flushBuffer(id);
    }, BUFFER_FLUSH_DELAY);

    this.flushTimers.set(id, timer);
  }

  private async flushBuffer(terminalId: number): Promise<void> {
    const entry = this.terminalBuffers.get(terminalId);
    if (!entry || !entry.buffer.trim()) { return; }

    const bufferSnapshot = entry.buffer;
    entry.buffer = ''; // reset buffer

    // Quick check before expensive parsing
    if (!hasErrors(bufferSnapshot)) { return; }

    const errors = detectErrors(bufferSnapshot);
    if (errors.length === 0) { return; }

    try {
      await this.onErrorDetected(errors, bufferSnapshot, entry.terminal);
    } catch (err) {
      console.error('[Compiler Translator] Error callback failed:', err);
    }
  }

  getLastOutput(terminal: vscode.Terminal): string {
    const id = this.getTerminalId(terminal);
    return this.terminalBuffers.get(id)?.buffer || '';
  }

  dispose(): void {
    this.flushTimers.forEach(t => clearTimeout(t));
    this.flushTimers.clear();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}

/**
 * Strip ANSI escape codes from terminal output.
 * Required for clean error pattern matching.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
             .replace(/\x1b\][^\x07]*\x07/g, '')
             .replace(/\x1b[=>]/g, '')
             .replace(/\r/g, '\n');
}

/**
 * Detect language from active editor or file extension.
 */
export function detectLanguageFromEditor(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return 'Unknown'; }

  const langId = editor.document.languageId;
  const langMap: Record<string, string> = {
    python: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    csharp: 'C#',
    rust: 'Rust',
    go: 'Go',
    php: 'PHP',
    ruby: 'Ruby',
    kotlin: 'Kotlin',
    swift: 'Swift',
    dart: 'Dart',
    r: 'R',
    matlab: 'MATLAB',
    bash: 'Bash',
    powershell: 'PowerShell',
  };

  return langMap[langId] || langId || 'Unknown';
}
