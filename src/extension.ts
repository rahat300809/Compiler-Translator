/**
 * Compiler Translator v2.1
 * COMMANDS ARE REGISTERED FIRST — nothing can block them.
 */

import * as vscode from 'vscode';

// ─── Terminal buffer (module-level, always available) ─────────────────────────
const buffers = new Map<vscode.Terminal, string>();
const MAX_BUF = 20_000;
let busy = false;
let btn: vscode.StatusBarItem | undefined;

// ─── ACTIVATE — commands registered FIRST, everything else after ──────────────
export function activate(ctx: vscode.ExtensionContext): void {

  // ══ STEP 1: Register commands immediately — NOTHING before this ══
  ctx.subscriptions.push(
    vscode.commands.registerCommand('compilerTranslator.explainTerminal', cmdExplain),
    vscode.commands.registerCommand('compilerTranslator.configure',       cmdConfigure),
    vscode.commands.registerCommand('compilerTranslator.clearHistory',    cmdClear),
  );

  // ══ STEP 2: Status bar button ══
  try {
    btn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
    btn.text            = '$(robot) Explain Output';
    btn.tooltip         = 'Read terminal output → AI explains errors  (Ctrl+Shift+E)';
    btn.command         = 'compilerTranslator.explainTerminal';
    btn.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    btn.show();
    ctx.subscriptions.push(btn);
  } catch (e) { console.error('[CT] Status bar error:', e); }

  // ══ STEP 3: Seed existing terminals ══
  try {
    vscode.window.terminals.forEach(t => buffers.set(t, ''));
    ctx.subscriptions.push(
      vscode.window.onDidOpenTerminal(t  => buffers.set(t, '')),
      vscode.window.onDidCloseTerminal(t => buffers.delete(t)),
    );
  } catch (e) { console.error('[CT] Terminal tracking error:', e); }

  // ══ STEP 4: Capture terminal output (safe — won't crash if API missing) ══
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onWrite = (vscode.window as any).onDidWriteTerminalData;
    if (typeof onWrite === 'function') {
      ctx.subscriptions.push(
        onWrite((e: { terminal: vscode.Terminal; data: string }) => {
          try {
            const prev = buffers.get(e.terminal) ?? '';
            buffers.set(e.terminal, (prev + clean(e.data)).slice(-MAX_BUF));
          } catch { /* ignore */ }
        })
      );
      console.log('[CT] Terminal capture active');
    } else {
      console.warn('[CT] onDidWriteTerminalData not available');
    }
  } catch (e) { console.error('[CT] Capture setup error:', e); }

  // ══ STEP 5: Welcome message ══
  try {
    const ch = vscode.window.createOutputChannel('Compiler Translator');
    ctx.subscriptions.push(ch);
    ch.appendLine('══════════════════════════════════════════════');
    ch.appendLine('  🤖 Compiler Translator v2.1  —  Ready!');
    ch.appendLine('');
    ch.appendLine('  1. Run your code (any way you want)');
    ch.appendLine('  2. Press  🤖 Explain Output  button');
    ch.appendLine('     (or Ctrl+Shift+E  or  right-click terminal)');
    ch.appendLine('  3. AI explains the error in plain language');
    ch.appendLine('     No error? → ✅ Code OK!');
    ch.appendLine('══════════════════════════════════════════════');
  } catch (e) { console.error('[CT] Output channel error:', e); }

  console.log('[CT] Activated OK — commands ready');
}

// ─── MAIN: Explain terminal output ───────────────────────────────────────────
async function cmdExplain(): Promise<void> {
  if (busy) {
    vscode.window.showInformationMessage('⏳ Already analyzing…');
    return;
  }

  // Collect output from active terminal, fall back to any terminal
  const active = vscode.window.activeTerminal;
  let output   = active ? (buffers.get(active) ?? '') : '';

  if (!output.trim()) {
    // try all terminals
    for (const [, buf] of buffers) {
      if (buf.trim().length > output.trim().length) { output = buf; }
    }
  }

  if (!output.trim()) {
    vscode.window.showInformationMessage(
      '🤖 No terminal output yet.\n\nRun your code first, then press "🤖 Explain Output".'
    );
    return;
  }

  // ── Check for errors ──────────────────────────────────────────────────────
  const { hasErrors, detectErrors } = await import('./errorDetector');

  if (!hasErrors(output)) {
    const ch = getChannel();
    ch.show(false);
    ch.appendLine('');
    ch.appendLine('✅  Code ran successfully — no errors detected!');
    ch.appendLine('');
    ch.appendLine('Output:');
    ch.appendLine(output.trim().slice(-400));
    ch.appendLine('');

    if (btn) {
      const orig = btn.text;
      btn.text            = '$(check) Code OK!';
      btn.backgroundColor = undefined;
      setTimeout(() => {
        if (btn) {
          btn.text            = orig;
          btn.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
      }, 4000);
    }
    return;
  }

  // ── Errors found → Groq AI ────────────────────────────────────────────────
  busy = true;
  if (btn) { btn.text = '$(loading~spin) Asking AI…'; }

  const ch = getChannel();
  ch.show(false);

  try {
    const errors = detectErrors(output);
    const err    = errors[0];
    const rawErr = err?.raw ?? output.slice(-3000);
    const lang   = (err?.language && err.language !== 'Unknown') ? err.language : getLang();

    ch.appendLine('');
    ch.appendLine(`⏳ Reading terminal — asking Groq AI about ${lang} error…`);

    const { explainError } = await import('./groqClient');
    const cfg        = vscode.workspace.getConfiguration('compilerTranslator');
    const outputLang = cfg.get<string>('language') ?? 'English';
    const explanation = await explainError(rawErr, '', lang, outputLang);

    // Write explanation
    const sep = '─'.repeat(56);
    ch.appendLine('');
    ch.appendLine(sep);
    ch.appendLine(`🤖 AI Explanation  [${new Date().toLocaleTimeString()}]`);
    ch.appendLine(`   Language: ${lang}  |  Error: ${err?.errorType ?? 'Error'}`);
    ch.appendLine(sep);
    ch.appendLine('');
    ch.appendLine(explanation);
    ch.appendLine('');
    ch.appendLine(sep);
    ch.appendLine('');

    // Firebase — completely optional, fire-and-forget
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
    ch.appendLine(`❌ AI failed: ${msg}`);
    ch.appendLine('');
    vscode.window.showErrorMessage(`Compiler Translator: ${msg}`, 'Configure').then(s => {
      if (s === 'Configure') { vscode.commands.executeCommand('compilerTranslator.configure'); }
    });
  } finally {
    busy = false;
    if (btn) { btn.text = '$(robot) Explain Output'; }
  }
}

// ─── Other commands ───────────────────────────────────────────────────────────
async function cmdClear(): Promise<void> {
  buffers.forEach((_, t) => buffers.set(t, ''));
  const ch = getChannel();
  ch.clear();
  ch.appendLine('🗑️ Buffer cleared. Run your code, then press "🤖 Explain Output".');
}

async function cmdConfigure(): Promise<void> {
  const pick = await vscode.window.showQuickPick([
    { label: '🔑 Add Groq API Keys',           detail: 'Add your own keys (3 built-in already)' },
    { label: '🤖 Change AI Model',              detail: 'LLaMA 3.3, Mixtral, Gemma2…' },
    { label: '🌍 Change Explanation Language',  detail: 'English, Bangla, Spanish…' },
    { label: '⚙️ Open Full Settings' },
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
    vscode.commands.executeCommand(
      'workbench.action.openSettings', '@ext:rahat300809.compiler-translator'
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
let _ch: vscode.OutputChannel | undefined;
function getChannel(): vscode.OutputChannel {
  if (!_ch) { _ch = vscode.window.createOutputChannel('Compiler Translator'); }
  return _ch;
}

function getLang(): string {
  const map: Record<string, string> = {
    python:'Python', javascript:'JavaScript', typescript:'TypeScript',
    java:'Java', cpp:'C++', c:'C', csharp:'C#', go:'Go', rust:'Rust',
    php:'PHP', ruby:'Ruby', kotlin:'Kotlin',
  };
  return map[vscode.window.activeTextEditor?.document.languageId ?? ''] ?? 'Unknown';
}

function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
          .replace(/\x1b\][^\x07]*\x07/g, '')
          .replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ─── Deactivate ───────────────────────────────────────────────────────────────
export function deactivate(): void {
  _ch?.dispose();
  buffers.clear();
}
