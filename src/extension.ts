/**
 * Compiler Translator v2.0 — Simple & Reliable
 *
 * HOW IT WORKS:
 *   1. You run your code normally (any way you want)
 *   2. Press "🤖 Explain" button in status bar (or Ctrl+Shift+E)
 *   3. Extension reads current terminal output → Groq AI explains errors
 *   4. If no errors → shows "✅ Code OK!"
 *
 * Terminal output is captured automatically in background.
 * Works in EVERY folder with zero setup.
 */

import * as vscode from 'vscode';
import { detectErrors, hasErrors, DetectedError } from './errorDetector';
import { explainError } from './groqClient';
import { getOrCreateOutputChannel, writeToOutputChannel, disposeOutputs } from './outputPanel';

// ─── Terminal output buffer ───────────────────────────────────────────────────
// Maps terminal → last captured output text
const terminalBuffers = new Map<vscode.Terminal, string>();
const MAX_BUFFER = 20000; // chars

// ─── State ────────────────────────────────────────────────────────────────────
let explainBtn: vscode.StatusBarItem;
let busy = false;

// ─── Activate ────────────────────────────────────────────────────────────────
export function activate(ctx: vscode.ExtensionContext): void {
  try {
    console.log('[CT] Compiler Translator v2.0 activating...');

    // ── "🤖 Explain" button in status bar ─────────────────────────────────
    explainBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
    explainBtn.text            = '$(robot) Explain Output';
    explainBtn.tooltip         = 'Read terminal output and explain errors with AI  (Ctrl+Shift+E)';
    explainBtn.command         = 'compilerTranslator.explainTerminal';
    explainBtn.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    explainBtn.show();
    ctx.subscriptions.push(explainBtn);

    // ── Terminal output capture ────────────────────────────────────────────
    startCapture(ctx);

    // ── Commands ──────────────────────────────────────────────────────────
    ctx.subscriptions.push(
      vscode.commands.registerCommand('compilerTranslator.explainTerminal', cmdExplain),
      vscode.commands.registerCommand('compilerTranslator.configure',       cmdConfigure),
      vscode.commands.registerCommand('compilerTranslator.clearHistory',    cmdClear),
    );

    ctx.subscriptions.push({ dispose: () => disposeOutputs() });

    // ── Welcome in output channel ──────────────────────────────────────────
    const ch = getOrCreateOutputChannel();
    ch.appendLine('══════════════════════════════════════════════════');
    ch.appendLine('  🤖 Compiler Translator v2.0  Ready!');
    ch.appendLine('');
    ch.appendLine('  → Run your code normally (any terminal/button)');
    ch.appendLine('  → Press "🤖 Explain Output" button OR Ctrl+Shift+E');
    ch.appendLine('  → AI explains the error in plain language');
    ch.appendLine('══════════════════════════════════════════════════');

    console.log('[CT] Activated successfully!');

  } catch (e) {
    console.error('[CT] Activation error:', e);
    vscode.window.showErrorMessage(`Compiler Translator failed to start: ${e}`);
  }
}

// ─── Capture terminal output ──────────────────────────────────────────────────
function startCapture(ctx: vscode.ExtensionContext): void {
  // Seed existing terminals
  vscode.window.terminals.forEach(t => terminalBuffers.set(t, ''));

  // Track new terminals
  ctx.subscriptions.push(
    vscode.window.onDidOpenTerminal(t => terminalBuffers.set(t, '')),
    vscode.window.onDidCloseTerminal(t => terminalBuffers.delete(t))
  );

  // Read terminal data (VS Code 1.85+)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writeEvent = (vscode.window as any).onDidWriteTerminalData;
  if (typeof writeEvent === 'function') {
    ctx.subscriptions.push(
      writeEvent((e: { terminal: vscode.Terminal; data: string }) => {
        const clean = stripAnsi(e.data);
        const prev  = terminalBuffers.get(e.terminal) ?? '';
        const next  = (prev + clean).slice(-MAX_BUFFER); // keep last MAX_BUFFER chars
        terminalBuffers.set(e.terminal, next);
      })
    );
    console.log('[CT] Terminal capture: onDidWriteTerminalData active');
  } else {
    console.warn('[CT] onDidWriteTerminalData not available in this VS Code version');
  }
}

// ─── MAIN COMMAND: Explain terminal output ───────────────────────────────────
async function cmdExplain(): Promise<void> {
  if (busy) {
    vscode.window.showInformationMessage('⏳ Already analyzing, please wait...');
    return;
  }

  // Get output from the ACTIVE terminal
  const terminal = vscode.window.activeTerminal;
  let output     = terminal ? (terminalBuffers.get(terminal) ?? '') : '';

  // Fallback: check all terminals and pick the one with most recent output
  if (!output.trim()) {
    for (const [, buf] of terminalBuffers) {
      if (buf.trim().length > output.length) { output = buf; }
    }
  }

  if (!output.trim()) {
    vscode.window.showInformationMessage(
      '🤖 No terminal output captured yet.\n\n' +
      'Run your code first, then press "🤖 Explain Output".'
    );
    return;
  }

  // ── Check for errors ──────────────────────────────────────────────────────
  if (!hasErrors(output)) {
    const ch = getOrCreateOutputChannel();
    ch.show(false);
    ch.appendLine('');
    ch.appendLine('✅ Code ran successfully — no errors detected!');
    ch.appendLine('');
    ch.appendLine('Output preview:');
    ch.appendLine(output.trim().slice(-500));
    ch.appendLine('');

    // Flash status bar green
    explainBtn.text            = '$(check) Code OK!';
    explainBtn.backgroundColor = undefined;
    setTimeout(() => {
      explainBtn.text            = '$(robot) Explain Output';
      explainBtn.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }, 4000);

    return;
  }

  // ── Errors found → send to Groq AI ───────────────────────────────────────
  busy = true;
  explainBtn.text = '$(loading~spin) Asking AI...';

  try {
    const errors = detectErrors(output);
    const error  = errors[0] ?? {
      raw: output.slice(-2000), language: detectLang(), errorType: 'Error',
      message: output.split('\n').find(l => /error|Error/i.test(l)) ?? 'Unknown error',
      severity: 'error' as const
    };

    const cfg        = vscode.workspace.getConfiguration('compilerTranslator');
    const outputLang = cfg.get<string>('language') ?? 'English';
    const lang       = error.language !== 'Unknown' ? error.language : detectLang();

    const ch = getOrCreateOutputChannel();
    ch.show(false);
    ch.appendLine('');
    ch.appendLine('⏳ Reading terminal output and asking Groq AI...');

    const explanation = await explainError(error.raw || output.slice(-3000), '', lang, outputLang);

    // Log to Firebase (fire-and-forget, won't block)
    firebaseLog(error, explanation, lang).catch(() => {/* ignore */});

    writeToOutputChannel(explanation, {
      language: lang,
      errorType: error.errorType,
      file: error.file,
      line: error.line
    }, null);

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    getOrCreateOutputChannel().appendLine(`\n❌ AI failed: ${msg}\n`);
    vscode.window.showErrorMessage(
      `Compiler Translator: ${msg}`,
      'Configure Keys'
    ).then(s => {
      if (s === 'Configure Keys') { vscode.commands.executeCommand('compilerTranslator.configure'); }
    });
  } finally {
    busy = false;
    explainBtn.text = '$(robot) Explain Output';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectLang(): string {
  const editor = vscode.window.activeTextEditor;
  const map: Record<string, string> = {
    python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript',
    java: 'Java', cpp: 'C++', c: 'C', csharp: 'C#', go: 'Go', rust: 'Rust',
    php: 'PHP', ruby: 'Ruby', kotlin: 'Kotlin',
  };
  return map[editor?.document.languageId ?? ''] ?? 'Unknown';
}

async function firebaseLog(
  error: DetectedError,
  explanation: string,
  lang: string
): Promise<void> {
  try {
    const { logErrorSession } = await import('./firebaseService');
    const cfg   = vscode.workspace.getConfiguration('compilerTranslator');
    const model = cfg.get<string>('groqModel') ?? 'llama-3.3-70b-versatile';
    const ws    = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    await logErrorSession(error, explanation, ws, model);
  } catch { /* ignore Firebase errors */ }
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
          .replace(/\x1b\][^\x07]*\x07/g, '')
          .replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ─── Other commands ───────────────────────────────────────────────────────────
async function cmdClear(): Promise<void> {
  terminalBuffers.forEach((_, t) => terminalBuffers.set(t, ''));
  const ch = getOrCreateOutputChannel();
  ch.clear();
  ch.appendLine('🗑️ Buffer cleared. Run your code and press "🤖 Explain Output".');
}

async function cmdConfigure(): Promise<void> {
  const pick = await vscode.window.showQuickPick([
    { label: '🔑 Add Groq API Keys',          detail: 'Add your own keys (3 built-in already)' },
    { label: '🤖 Change AI Model',             detail: 'LLaMA 3.3, Mixtral, Gemma2…' },
    { label: '🌍 Change Explanation Language',  detail: 'English, Bangla, Spanish…' },
    { label: '⚙️ Open Full Settings',           detail: 'All settings' },
  ], { placeHolder: 'Compiler Translator — Configure' });

  if (!pick) { return; }
  const cfg = vscode.workspace.getConfiguration('compilerTranslator');

  if (pick.label.includes('API Keys')) {
    const keys = await vscode.window.showInputBox({
      prompt: 'Groq API keys (comma-separated)', password: true,
      placeHolder: 'gsk_key1, gsk_key2'
    });
    if (keys) {
      await cfg.update('groqApiKeys', keys.split(',').map(k => k.trim()).filter(Boolean),
        vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('✅ Keys saved!');
    }
  } else if (pick.label.includes('Model')) {
    const m = await vscode.window.showQuickPick(
      ['llama-3.3-70b-versatile','llama-3.1-8b-instant','mixtral-8x7b-32768','gemma2-9b-it']
    );
    if (m) { await cfg.update('groqModel', m, vscode.ConfigurationTarget.Global); }
  } else if (pick.label.includes('Language')) {
    const l = await vscode.window.showQuickPick(
      ['English','Bangla','Spanish','French','Hindi','Arabic']
    );
    if (l) { await cfg.update('language', l, vscode.ConfigurationTarget.Global); }
  } else {
    vscode.commands.executeCommand('workbench.action.openSettings', '@ext:rahat300809.compiler-translator');
  }
}

// ─── Deactivate ───────────────────────────────────────────────────────────────
export function deactivate(): void {
  disposeOutputs();
  terminalBuffers.clear();
}
