/**
 * Compiler Translator v2.2
 *
 * Guaranteed Terminal Capture:
 *  1. Terminal Shell Execution (VS Code 1.93+ standard API)
 *  2. Direct Terminal Screen Grab (selectAll + copySelection fallback)
 *  3. Problems / Diagnostics fallback
 *  4. AI Explanation via Groq with auto-fallback to "Code OK!" when no errors
 */

import * as vscode from 'vscode';

// ─── Terminal buffer ──────────────────────────────────────────────────────────
const buffers = new Map<vscode.Terminal, string>();
const MAX_BUF = 30_000;
let busy = false;
let btn: vscode.StatusBarItem | undefined;

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────
export function activate(ctx: vscode.ExtensionContext): void {

  // ══ STEP 1: Register commands FIRST ══
  ctx.subscriptions.push(
    vscode.commands.registerCommand('compilerTranslator.explainTerminal', cmdExplain),
    vscode.commands.registerCommand('compilerTranslator.configure',       cmdConfigure),
    vscode.commands.registerCommand('compilerTranslator.clearHistory',    cmdClear),
  );

  // ══ STEP 2: Status bar button ══
  try {
    btn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
    btn.text            = '$(robot) Explain Output';
    btn.tooltip         = 'Explain Terminal Output using Groq AI (Ctrl+Shift+E)';
    btn.command         = 'compilerTranslator.explainTerminal';
    btn.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    btn.show();
    ctx.subscriptions.push(btn);
  } catch (e) {
    console.error('[CT] Status bar error:', e);
  }

  // ══ STEP 3: Track terminals ══
  try {
    vscode.window.terminals.forEach(t => buffers.set(t, ''));
    ctx.subscriptions.push(
      vscode.window.onDidOpenTerminal(t  => buffers.set(t, '')),
      vscode.window.onDidCloseTerminal(t => buffers.delete(t)),
    );
  } catch (e) {
    console.error('[CT] Terminal tracking error:', e);
  }

  // ══ STEP 4: Shell Execution API (VS Code 1.93+) ══
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = vscode.window as any;
    if (typeof win.onDidStartTerminalShellExecution === 'function') {
      ctx.subscriptions.push(
        win.onDidStartTerminalShellExecution((e: { terminal: vscode.Terminal; execution: { read: () => AsyncIterable<string> } }) => {
          try {
            const stream = e.execution?.read?.();
            if (stream) {
              (async () => {
                try {
                  for await (const chunk of stream) {
                    const prev = buffers.get(e.terminal) ?? '';
                    buffers.set(e.terminal, (prev + clean(String(chunk))).slice(-MAX_BUF));
                  }
                } catch { /* stream ended */ }
              })();
            }
          } catch { /* ignore */ }
        })
      );
      console.log('[CT] Terminal Shell Execution listener ready');
    }

    if (typeof win.onDidWriteTerminalData === 'function') {
      ctx.subscriptions.push(
        win.onDidWriteTerminalData((e: { terminal: vscode.Terminal; data: string }) => {
          try {
            const prev = buffers.get(e.terminal) ?? '';
            buffers.set(e.terminal, (prev + clean(e.data)).slice(-MAX_BUF));
          } catch { /* ignore */ }
        })
      );
    }
  } catch (e) {
    console.warn('[CT] Terminal listener setup warning:', e);
  }

  // ══ STEP 5: Welcome message in output channel ══
  try {
    const ch = getChannel();
    ch.appendLine('════════════════════════════════════════════════════════');
    ch.appendLine('  🤖 Compiler Translator v2.2 — Ready!');
    ch.appendLine('');
    ch.appendLine('  • Run your code in the Terminal');
    ch.appendLine('  • Click  [🤖 Explain Output]  or press Ctrl+Shift+E');
    ch.appendLine('  • AI explains compiler/runtime errors and provides fixes');
    ch.appendLine('  • If code runs without errors → shows ✅ Code OK!');
    ch.appendLine('════════════════════════════════════════════════════════');
  } catch (e) {
    console.error('[CT] Output channel setup error:', e);
  }

  console.log('[CT] Compiler Translator activated');
}

// ─── MAIN: Explain terminal output ───────────────────────────────────────────
async function cmdExplain(): Promise<void> {
  if (busy) {
    vscode.window.showInformationMessage('⏳ Already analyzing output…');
    return;
  }

  // ── 1. Retrieve output (Buffer → Screen Grab → Problems) ─────────────────────
  let output = '';

  // A. Check in-memory buffer for active terminal
  const activeTerm = vscode.window.activeTerminal;
  if (activeTerm && buffers.has(activeTerm)) {
    output = buffers.get(activeTerm) ?? '';
  }

  // B. Fallback to any terminal buffer
  if (!output.trim()) {
    for (const [, buf] of buffers) {
      if (buf.trim().length > output.trim().length) {
        output = buf;
      }
    }
  }

  // C. Screen Grab from active terminal (works 100% even if no listener fired)
  if (!output.trim() || !hasErrorsQuick(output)) {
    const screenText = await grabActiveTerminalText();
    if (screenText.trim()) {
      output = screenText;
      if (activeTerm) {
        buffers.set(activeTerm, output);
      }
    }
  }

  // D. Fallback: check Problems tab diagnostics
  if (!output.trim()) {
    output = getProblemsDiagnostics();
  }

  // E. If still empty, allow user to input or paste
  if (!output.trim()) {
    const pasted = await vscode.window.showInputBox({
      prompt: 'No terminal output found. Paste your error message here:',
      placeHolder: 'e.g. run.java:12: error: not a statement'
    });
    if (pasted?.trim()) {
      output = pasted.trim();
    } else {
      vscode.window.showWarningMessage(
        '🤖 No terminal output detected. Please run your code in the terminal first!'
      );
      return;
    }
  }

  // ── 2. Check for errors ───────────────────────────────────────────────────
  const { hasErrors, detectErrors, extractCodeContext } = await import('./errorDetector');

  if (!hasErrors(output)) {
    const ch = getChannel();
    ch.show(false);
    ch.appendLine('');
    ch.appendLine('✅ Code ran successfully — no errors detected!');
    ch.appendLine('');
    ch.appendLine('Terminal Output:');
    ch.appendLine(output.trim().slice(-600));
    ch.appendLine('');

    vscode.window.showInformationMessage('✅ Code OK! No errors detected in terminal.');

    if (btn) {
      const origText = btn.text;
      btn.text            = '$(check) Code OK!';
      btn.backgroundColor = undefined;
      setTimeout(() => {
        if (btn) {
          btn.text            = origText;
          btn.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
      }, 4000);
    }
    return;
  }

  // ── 3. Errors detected → Query Groq AI ─────────────────────────────────────
  busy = true;
  if (btn) { btn.text = '$(loading~spin) Asking AI…'; }

  const ch = getChannel();
  ch.show(true); // Focus the output channel so user sees it right away

  try {
    const errors = detectErrors(output);
    const err = errors[0];
    const rawErr = (errors.length > 1)
      ? errors.map(e => e.raw).join('\n\n')
      : (err?.raw ?? output.slice(-3000));

    const lang = (err?.language && err.language !== 'Unknown') ? err.language : getActiveLanguage();

    ch.appendLine('');
    ch.appendLine(`⏳ [${new Date().toLocaleTimeString()}] Analyzing ${lang} error with Groq AI…`);

    // Read source code from workspace folder / open editor
    let codeCtx = '';
    try {
      codeCtx = await findAndReadCode(err?.file, err?.line);
      if (codeCtx) {
        ch.appendLine(`📂 Code context loaded from folder (${err?.file ?? 'active editor'})`);
      }
    } catch (e) {
      console.warn('[CT] Code reading warning:', e);
    }

    const { explainError } = await import('./groqClient');
    const cfg        = vscode.workspace.getConfiguration('compilerTranslator');
    const outputLang = cfg.get<string>('language') ?? 'English';

    const explanation = await explainError(rawErr, codeCtx, lang, outputLang);

    // Write formatted explanation to Output Channel
    const sep = '═'.repeat(60);
    ch.appendLine('');
    ch.appendLine(sep);
    ch.appendLine(`🤖 AI EXPLANATION — ${lang.toUpperCase()}`);
    ch.appendLine(`   File: ${err?.file ?? 'Terminal'} ${err?.line ? `(Line ${err.line})` : ''}`);
    ch.appendLine(`   Error Type: ${err?.errorType ?? 'Compiler Error'}`);
    ch.appendLine(sep);
    ch.appendLine('');
    ch.appendLine(explanation);
    ch.appendLine('');
    ch.appendLine(sep);
    ch.appendLine('');

    vscode.window.showInformationMessage(
      `🤖 Error Explained (${lang})! See Compiler Translator output.`,
      'Show Output'
    ).then(choice => {
      if (choice === 'Show Output') {
        ch.show(true);
      }
    });

    // Optional Firebase session logging
    if (err) {
      import('./firebaseService').then(async fb => {
        const ws  = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const mdl = cfg.get<string>('groqModel') ?? 'llama-3.3-70b-versatile';
        await fb.logErrorSession(err, explanation, ws, mdl).catch(() => {});
      }).catch(() => {});
    }

  } catch (e) {
    const msg = (e instanceof Error) ? e.message : String(e);
    ch.appendLine('');
    ch.appendLine(`❌ AI error: ${msg}`);
    ch.appendLine('');
    vscode.window.showErrorMessage(`Compiler Translator: ${msg}`, 'Configure').then(s => {
      if (s === 'Configure') {
        vscode.commands.executeCommand('compilerTranslator.configure');
      }
    });
  } finally {
    busy = false;
    if (btn) { btn.text = '$(robot) Explain Output'; }
  }
}

// ─── Terminal Screen Grabber ──────────────────────────────────────────────────
async function grabActiveTerminalText(): Promise<string> {
  try {
    let origClip = '';
    try {
      origClip = await Promise.resolve(vscode.env.clipboard.readText());
    } catch { /* ignore */ }

    const probe = `__CT_PROBE_${Date.now()}__`;
    try {
      await Promise.resolve(vscode.env.clipboard.writeText(probe));
    } catch { /* ignore */ }

    const term = vscode.window.activeTerminal;
    if (term) {
      term.show(true);
    }
    await vscode.commands.executeCommand('workbench.action.terminal.focus');
    await delay(80);

    // 1. Try copying existing selection first
    await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
    await delay(60);
    let grabbed = '';
    try {
      grabbed = await Promise.resolve(vscode.env.clipboard.readText());
    } catch { /* ignore */ }

    // 2. If nothing was selected, select all and copy
    if (!grabbed || grabbed === probe || !grabbed.trim()) {
      await vscode.commands.executeCommand('workbench.action.terminal.selectAll');
      await delay(80);
      await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
      await delay(80);
      await vscode.commands.executeCommand('workbench.action.terminal.clearSelection');
      await delay(40);
      try {
        grabbed = await Promise.resolve(vscode.env.clipboard.readText());
      } catch { /* ignore */ }
    }

    // 3. Restore original clipboard
    if (origClip !== probe) {
      try {
        await Promise.resolve(vscode.env.clipboard.writeText(origClip));
      } catch { /* ignore */ }
    }

    if (grabbed && grabbed !== probe && grabbed.trim().length > 0) {
      return clean(grabbed);
    }
  } catch (err) {
    console.warn('[CT] Screen grab failed:', err);
  }
  return '';
}

// ─── Diagnostics Fallback ─────────────────────────────────────────────────────
function getProblemsDiagnostics(): string {
  try {
    const lines: string[] = [];
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (activeDoc) {
      const diags = vscode.languages.getDiagnostics(activeDoc.uri);
      for (const d of diags) {
        if (d.severity === vscode.DiagnosticSeverity.Error) {
          lines.push(`${activeDoc.fileName}:${d.range.start.line + 1}: error: ${d.message}`);
        }
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

// ─── Folder & Workspace Code Reader ───────────────────────────────────────────
async function findAndReadCode(fileName?: string, errorLine?: number): Promise<string> {
  try {
    const activeEditor = vscode.window.activeTextEditor;
    const baseName = fileName ? fileName.replace(/^[\\/]/, '').split(/[\\/]/).pop()?.toLowerCase() : undefined;

    // 1. Check active editor if it matches or if no filename was specified
    if (activeEditor) {
      const activeDoc = activeEditor.document;
      if (!baseName || activeDoc.fileName.toLowerCase().endsWith(baseName)) {
        return formatCodeSnippet(activeDoc.getText(), errorLine);
      }
    }

    // 2. Search all open tabs in VS Code
    if (baseName) {
      for (const doc of vscode.workspace.textDocuments) {
        if (doc.fileName.toLowerCase().endsWith(baseName)) {
          return formatCodeSnippet(doc.getText(), errorLine);
        }
      }

      // 3. Search in workspace folders
      const uris = await vscode.workspace.findFiles(`**/${baseName}`, '**/node_modules/**', 2);
      if (uris.length > 0) {
        const data = await vscode.workspace.fs.readFile(uris[0]);
        const text = Buffer.from(data).toString('utf-8');
        return formatCodeSnippet(text, errorLine);
      }
    }

    // 4. Fallback to active editor if any file is open
    if (activeEditor) {
      return formatCodeSnippet(activeEditor.document.getText(), errorLine);
    }
  } catch (err) {
    console.warn('[CT] Failed to read code from folder:', err);
  }
  return '';
}

function formatCodeSnippet(fullText: string, errorLine?: number): string {
  const lines = fullText.split(/\r?\n/);
  if (lines.length <= 120) {
    return lines
      .map((l, i) => `${String(i + 1).padStart(4, ' ')}${errorLine && i + 1 === errorLine ? ' ❌ ' : ' │ '}${l}`)
      .join('\n');
  }

  const target = errorLine ?? 1;
  const start = Math.max(0, target - 15);
  const end = Math.min(lines.length, target + 15);
  return lines
    .slice(start, end)
    .map((l, i) => {
      const num = start + i + 1;
      return `${String(num).padStart(4, ' ')}${num === errorLine ? ' ❌ ' : ' │ '}${l}`;
    })
    .join('\n');
}

// ─── Quick error check ────────────────────────────────────────────────────────
function hasErrorsQuick(text: string): boolean {
  return /\b(error|Exception|Traceback|failed|fatal|SIGSEGV)\b/i.test(text);
}

// ─── Other commands ───────────────────────────────────────────────────────────
async function cmdClear(): Promise<void> {
  buffers.forEach((_, t) => buffers.set(t, ''));
  const ch = getChannel();
  ch.clear();
  ch.appendLine('🗑️ Terminal buffer cleared.');
}

async function cmdConfigure(): Promise<void> {
  const pick = await vscode.window.showQuickPick([
    { label: '🔑 Add Groq API Keys',          detail: 'Add your own keys (3 built-in already)' },
    { label: '🤖 Change AI Model',             detail: 'LLaMA 3.3, Mixtral, Gemma2…' },
    { label: '🌍 Change Explanation Language', detail: 'English, Bangla, Spanish, French…' },
    { label: '⚙️ Open Full Settings' },
  ], { placeHolder: 'Compiler Translator — Settings' });

  if (!pick) { return; }
  const cfg = vscode.workspace.getConfiguration('compilerTranslator');

  if (pick.label.includes('API Keys')) {
    const keys = await vscode.window.showInputBox({
      prompt: 'Groq API keys (comma-separated)',
      password: true,
      placeHolder: 'gsk_key1, gsk_key2'
    });
    if (keys) {
      await cfg.update('groqApiKeys', keys.split(',').map(k => k.trim()).filter(Boolean),
        vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('✅ Groq API keys saved!');
    }
  } else if (pick.label.includes('Model')) {
    const m = await vscode.window.showQuickPick(
      ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it']
    );
    if (m) { await cfg.update('groqModel', m, vscode.ConfigurationTarget.Global); }
  } else if (pick.label.includes('Language')) {
    const l = await vscode.window.showQuickPick(
      ['English', 'Bangla', 'Spanish', 'French', 'Hindi', 'Arabic']
    );
    if (l) { await cfg.update('language', l, vscode.ConfigurationTarget.Global); }
  } else {
    vscode.commands.executeCommand(
      'workbench.action.openSettings', '@ext:rahat300809.compiler-translator'
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
let _ch: vscode.OutputChannel | undefined;
function getChannel(): vscode.OutputChannel {
  if (!_ch) {
    _ch = vscode.window.createOutputChannel('Compiler Translator');
  }
  return _ch;
}

function getActiveLanguage(): string {
  const map: Record<string, string> = {
    python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript',
    java: 'Java', cpp: 'C++', c: 'C', csharp: 'C#', go: 'Go', rust: 'Rust',
    php: 'PHP', ruby: 'Ruby', kotlin: 'Kotlin',
  };
  return map[vscode.window.activeTextEditor?.document.languageId ?? ''] ?? 'Unknown';
}

function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
          .replace(/\x1b\][^\x07]*\x07/g, '')
          .replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Deactivate ───────────────────────────────────────────────────────────────
export function deactivate(): void {
  _ch?.dispose();
  buffers.clear();
}
