/**
 * Terminal Watcher — captures output from ALL terminals automatically.
 *
 * Uses TWO methods simultaneously for maximum reliability:
 *   1. onDidWriteTerminalData — reads every character written to terminal
 *   2. onDidEndTaskProcess   — fires when any VS Code task/run finishes
 *
 * Works in EVERY folder with ZERO configuration.
 */

import * as vscode from 'vscode';
import { detectErrors, hasErrors, extractCodeContext, DetectedError } from './errorDetector';

interface TerminalBuffer {
  terminal: vscode.Terminal;
  buffer: string;
  lastActivity: number;
}

const MAX_BUFFER = 15000;        // chars to keep per terminal
let flushDelay  = 800;           // ms — read from config at runtime

export type ErrorCallback = (
  errors: DetectedError[],
  rawOutput: string,
  terminal: vscode.Terminal
) => Promise<void>;

// ─── TerminalWatcher class ────────────────────────────────────────────────────

export class TerminalWatcher {
  private disposables: vscode.Disposable[] = [];
  private buffers     = new Map<vscode.Terminal, TerminalBuffer>();
  private timers      = new Map<vscode.Terminal, NodeJS.Timeout>();
  private enabled     = true;
  private callback: ErrorCallback;

  constructor(callback: ErrorCallback) {
    this.callback = callback;
  }

  start(): void {
    // ── Method 1: onDidWriteTerminalData ──────────────────────────────────────
    // Available in VS Code 1.93+. Fires for EVERY character written to terminal.
    const terminalDataApi = (vscode.window as any).onDidWriteTerminalData;
    if (typeof terminalDataApi === 'function') {
      this.disposables.push(
        terminalDataApi((event: { terminal: vscode.Terminal; data: string }) => {
          if (this.enabled) {
            this.onData(event.terminal, event.data);
          }
        })
      );
      console.log('[CT] Terminal data capture: ACTIVE (onDidWriteTerminalData)');
    } else {
      console.warn('[CT] onDidWriteTerminalData not available — using task hooks only');
    }

    // ── Method 2: Task process end events ────────────────────────────────────
    // Fires when ANY task (Run Build Task, Run Test Task, Code Runner, etc.) ends.
    this.disposables.push(
      vscode.tasks.onDidEndTaskProcess(e => {
        if (!this.enabled) { return; }
        const exitCode = e.exitCode ?? 0;
        if (exitCode !== 0) {
          // Task failed — trigger analysis on the most recently active terminal
          const activeTerminal = vscode.window.activeTerminal;
          if (activeTerminal) {
            const buf = this.buffers.get(activeTerminal);
            if (buf && buf.buffer.trim()) {
              this.scheduleFlush(activeTerminal);
            }
          }
        }
      })
    );

    // ── Track terminal open/close ────────────────────────────────────────────
    this.disposables.push(
      vscode.window.onDidOpenTerminal(t => {
        this.buffers.set(t, { terminal: t, buffer: '', lastActivity: Date.now() });
      }),
      vscode.window.onDidCloseTerminal(t => {
        this.timers.get(t) && clearTimeout(this.timers.get(t)!);
        this.timers.delete(t);
        this.buffers.delete(t);
      })
    );

    // Seed existing terminals
    vscode.window.terminals.forEach(t => {
      this.buffers.set(t, { terminal: t, buffer: '', lastActivity: Date.now() });
    });

    console.log('[CT] Terminal watcher started — monitoring ALL terminals globally');
  }

  private onData(terminal: vscode.Terminal, rawData: string): void {
    // Skip our own output terminals
    if (terminal.name.includes('AI Error Explainer') ||
        terminal.name.includes('▶ Run Output')) { return; }

    const text = stripAnsi(rawData);
    if (!text.trim()) { return; }

    let buf = this.buffers.get(terminal);
    if (!buf) {
      buf = { terminal, buffer: '', lastActivity: Date.now() };
      this.buffers.set(terminal, buf);
    }

    buf.buffer += text;
    buf.lastActivity = Date.now();

    // Keep buffer from growing forever
    if (buf.buffer.length > MAX_BUFFER) {
      buf.buffer = buf.buffer.slice(-MAX_BUFFER);
    }

    // Cancel existing timer and restart
    this.scheduleFlush(terminal);
  }

  private scheduleFlush(terminal: vscode.Terminal): void {
    const existing = this.timers.get(terminal);
    if (existing) { clearTimeout(existing); }

    // Read delay from config at call time
    const config = vscode.workspace.getConfiguration('compilerTranslator');
    flushDelay = config.get<number>('terminalCaptureDelay') ?? 800;

    const timer = setTimeout(() => this.flush(terminal), flushDelay);
    this.timers.set(terminal, timer);
  }

  private async flush(terminal: vscode.Terminal): Promise<void> {
    const buf = this.buffers.get(terminal);
    if (!buf || !buf.buffer.trim()) { return; }

    const snapshot = buf.buffer;
    buf.buffer = ''; // reset

    if (!hasErrors(snapshot)) { return; }

    const errors = detectErrors(snapshot);
    if (errors.length === 0) { return; }

    try {
      await this.callback(errors, snapshot, terminal);
    } catch (err) {
      console.error('[CT] Error callback threw:', err);
    }
  }

  /** Force-flush the active terminal's buffer right now */
  flushActive(): void {
    const t = vscode.window.activeTerminal;
    if (t) { this.flush(t); }
  }

  setEnabled(v: boolean): void { this.enabled = v; }
  isEnabled(): boolean { return this.enabled; }

  dispose(): void {
    this.timers.forEach(t => clearTimeout(t));
    this.disposables.forEach(d => d.dispose());
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip ANSI escape codes so regex patterns match cleanly */
function stripAnsi(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b[=>]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/** Detect language from active editor */
export function detectLanguageFromEditor(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return 'Unknown'; }

  const map: Record<string, string> = {
    python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript',
    java: 'Java', cpp: 'C++', c: 'C', csharp: 'C#', rust: 'Rust',
    go: 'Go', php: 'PHP', ruby: 'Ruby', kotlin: 'Kotlin', swift: 'Swift',
    dart: 'Dart', r: 'R', bash: 'Bash', powershell: 'PowerShell',
  };

  return map[editor.document.languageId] || editor.document.languageId || 'Unknown';
}
