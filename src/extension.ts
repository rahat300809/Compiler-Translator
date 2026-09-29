/**
 * Compiler Translator v1.1.0 — Main Extension Entry Point
 *
 * FULLY AUTOMATIC — install once, works in EVERY folder:
 *   • Watches ALL terminal output for errors (no setup per project)
 *   • Hooks into VS Code task completion events
 *   • Optional: auto-run on file save
 *   • Right-click any code file → "▶ Run & Explain"
 *   • Ctrl+Shift+R to run current file + get AI explanation
 *
 * Author: rahat300809
 * Repo: https://github.com/rahat300809/Compiler-Translator
 */

import * as vscode from 'vscode';
import * as cp     from 'child_process';
import * as path   from 'path';
import { TerminalWatcher, detectLanguageFromEditor } from './terminalWatcher';
import { detectErrors, extractCodeContext, DetectedError } from './errorDetector';
import { explainError } from './groqClient';
import { logErrorSession } from './firebaseService';
import {
  writeToOutputChannel,
  showProcessingMessage,
  getOrCreateOutputChannel,
  disposeOutputs
} from './outputPanel';

// ─── Run command map ──────────────────────────────────────────────────────────

const RUNNERS: Record<string, (f: string, d: string) => string> = {
  python:     f => `python "${f}"`,
  javascript: f => `node "${f}"`,
  typescript: f => `npx ts-node "${f}"`,
  java: (f, d) => `javac "${f}" && java -cp "${d}" "${path.basename(f, '.java')}"`,
  c:    (f, d) => {
    const out = path.join(d, '_ct_out');
    return `gcc "${f}" -o "${out}" && "${out}"`;
  },
  cpp:  (f, d) => {
    const out = path.join(d, '_ct_out');
    return `g++ "${f}" -o "${out}" && "${out}"`;
  },
  csharp:     f => `dotnet script "${f}"`,
  go:         f => `go run "${f}"`,
  rust: (f, d) => {
    const out = path.join(d, '_ct_out');
    return `rustc "${f}" -o "${out}" && "${out}"`;
  },
  php:   f => `php "${f}"`,
  ruby:  f => `ruby "${f}"`,
  kotlin: f => `kotlinc "${f}" -include-runtime -d _ct_out.jar && java -jar _ct_out.jar`,
  r:     f => `Rscript "${f}"`,
  bash:  f => `bash "${f}"`,
  powershell: f => `pwsh -File "${f}"`,
  perl:  f => `perl "${f}"`,
  lua:   f => `lua "${f}"`,
  swift: f => `swift "${f}"`,
  dart:  f => `dart "${f}"`,
};

const LANG_LABEL: Record<string, string> = {
  python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript',
  java: 'Java', c: 'C', cpp: 'C++', csharp: 'C#', go: 'Go', rust: 'Rust',
  php: 'PHP', ruby: 'Ruby', kotlin: 'Kotlin', r: 'R', bash: 'Bash',
  powershell: 'PowerShell', perl: 'Perl', lua: 'Lua', swift: 'Swift', dart: 'Dart',
};

// ─── State ────────────────────────────────────────────────────────────────────

let watcher: TerminalWatcher | null = null;
let barRun: vscode.StatusBarItem;
let barState: vscode.StatusBarItem;
let lastErrors: DetectedError[] = [];
let lastOutput = '';
let busy = false;

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(ctx: vscode.ExtensionContext): void {
  console.log('[CT] Compiler Translator activated');

  // ── Status bar: RUN button ─────────────────────────────────────────────────
  barRun = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
  barRun.text    = '$(play) Run & Explain';
  barRun.tooltip = 'Run current file — errors explained by AI  (Ctrl+Shift+R)';
  barRun.command = 'compilerTranslator.runAndExplain';
  barRun.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  barRun.show();
  ctx.subscriptions.push(barRun);

  // ── Status bar: state indicator ────────────────────────────────────────────
  barState = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
  barState.command = 'compilerTranslator.explainLast';
  setState('idle');
  barState.show();
  ctx.subscriptions.push(barState);

  // ── Terminal watcher ───────────────────────────────────────────────────────
  watcher = new TerminalWatcher(onErrorsFound);
  watcher.start();
  ctx.subscriptions.push({ dispose: () => watcher?.dispose() });

  // ── Auto-run on file save ──────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      const cfg = vscode.workspace.getConfiguration('compilerTranslator');
      if (!cfg.get<boolean>('autoRunOnSave')) { return; }
      if (RUNNERS[doc.languageId]) {
        vscode.commands.executeCommand('compilerTranslator.runAndExplain');
      }
    })
  );

  // ── Show/hide run button based on active editor ───────────────────────────
  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && RUNNERS[editor.document.languageId]) {
        barRun.show();
      } else {
        barRun.hide();
      }
    })
  );

  // ── Commands ───────────────────────────────────────────────────────────────
  ctx.subscriptions.push(
    vscode.commands.registerCommand('compilerTranslator.runAndExplain',    cmdRun),
    vscode.commands.registerCommand('compilerTranslator.explainLast',      cmdExplainLast),
    vscode.commands.registerCommand('compilerTranslator.toggleAutoExplain', cmdToggle),
    vscode.commands.registerCommand('compilerTranslator.clearHistory',     cmdClear),
    vscode.commands.registerCommand('compilerTranslator.showHistory',      cmdHistory),
    vscode.commands.registerCommand('compilerTranslator.configure',        cmdConfigure)
  );

  ctx.subscriptions.push({ dispose: () => disposeOutputs() });

  // ── Welcome ────────────────────────────────────────────────────────────────
  const ch = getOrCreateOutputChannel();
  ch.appendLine('══════════════════════════════════════════════════════════════');
  ch.appendLine('  🤖 Compiler Translator v1.1  —  AI Error Explainer');
  ch.appendLine('  Watching ALL terminals automatically across every folder.');
  ch.appendLine('');
  ch.appendLine('  ▶  Ctrl+Shift+R   →  Run current file + AI explains errors');
  ch.appendLine('  ▶  Ctrl+Shift+E   →  Re-explain last error');
  ch.appendLine('  ▶  Right-click code file  →  "Run & Explain"');
  ch.appendLine('  ▶  Any terminal error  →  AI auto-explains instantly');
  ch.appendLine('══════════════════════════════════════════════════════════════');
  ch.appendLine('');
}

// ─── Run & Explain command ────────────────────────────────────────────────────

async function cmdRun(): Promise<void> {
  if (busy) {
    vscode.window.showInformationMessage('⏳ Already running, please wait…');
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('🤖 Open a code file first.');
    return;
  }

  await editor.document.save();

  const filePath = editor.document.fileName;
  const fileDir  = path.dirname(filePath);
  const langId   = editor.document.languageId;
  const lang     = LANG_LABEL[langId] || langId;
  const runFn    = RUNNERS[langId];

  if (!runFn) {
    vscode.window.showWarningMessage(
      `🤖 "${lang}" can't be auto-run. Run it manually in the terminal — errors will still be detected automatically.`
    );
    return;
  }

  const cmd = runFn(filePath, fileDir);
  busy = true;
  setState('analyzing');

  const ch = getOrCreateOutputChannel();
  ch.show(false);
  ch.appendLine('');
  ch.appendLine(`▶ Running ${lang}: ${path.basename(filePath)}`);
  ch.appendLine('─'.repeat(60));

  // Also show real output in a run terminal
  const runTerm = getRunTerminal();
  runTerm.show(false);
  runTerm.sendText(`echo "▶ Running: ${path.basename(filePath)}" && ${cmd}`, true);

  // Capture output directly for AI analysis
  cp.exec(cmd, { cwd: fileDir, timeout: 30_000, maxBuffer: 1_048_576 }, async (err, stdout, stderr) => {
    try {
      const exitCode = (err as any)?.code ?? (err ? 1 : 0);
      const duration = '…';

      // Show program output in channel
      if (stdout.trim()) {
        ch.appendLine('📤 Output:');
        ch.appendLine(stdout.trim());
        ch.appendLine('');
      }

      const errorText = stderr.trim() || (exitCode !== 0 ? stdout.trim() : '');

      // ── Success ──────────────────────────────────────────────────────────
      if (!errorText && exitCode === 0) {
        ch.appendLine(`✅ Finished OK (exit 0)`);
        ch.appendLine('');
        setState('idle');
        vscode.window.setStatusBarMessage('✅ Ran successfully — no errors!', 5000);
        busy = false;
        return;
      }

      // ── Error detected ────────────────────────────────────────────────────
      ch.appendLine('❌ Error detected:');
      ch.appendLine(errorText.slice(0, 800));
      ch.appendLine('');

      const parsed = detectErrors(errorText);
      if (parsed.length === 0) {
        // Generic non-zero exit
        parsed.push({
          raw: errorText, language: lang,
          errorType: `Exit ${exitCode}`,
          message: errorText.split('\n')[0] || 'Program exited with error',
          severity: 'error'
        });
      }

      lastErrors = parsed;
      lastOutput = errorText;

      await explainAndLog(parsed, errorText, lang);

    } finally {
      busy = false;
    }
  });
}

// ─── Terminal watcher callback ────────────────────────────────────────────────

async function onErrorsFound(
  errors: DetectedError[],
  rawOutput: string,
  _terminal: vscode.Terminal
): Promise<void> {
  lastErrors = errors;
  lastOutput = rawOutput;

  const cfg = vscode.workspace.getConfiguration('compilerTranslator');
  if (!cfg.get<boolean>('autoExplain', true)) { return; }
  if (busy) { return; }

  busy = true;
  try {
    const lang = errors[0]?.language !== 'Unknown'
      ? errors[0]?.language
      : detectLanguageFromEditor();
    await explainAndLog(errors, rawOutput, lang);
  } finally {
    busy = false;
  }
}

// ─── Core: call Groq AI + write output + Firebase ────────────────────────────

async function explainAndLog(
  errors: DetectedError[],
  rawOutput: string,
  language: string
): Promise<void> {
  const cfg       = vscode.workspace.getConfiguration('compilerTranslator');
  const outputLang = cfg.get<string>('language') ?? 'English';
  const model      = cfg.get<string>('groqModel') ?? 'llama-3.3-70b-versatile';
  const firebase   = cfg.get<boolean>('enableFirebase') ?? true;

  setState('explaining');
  showProcessingMessage();

  const errorsToProcess = errors.slice(0, 3);

  for (const error of errorsToProcess) {
    try {
      // Get file context around the error line
      const editor   = vscode.window.activeTextEditor;
      const filePath = error.file ?? editor?.document.fileName;
      const ctx      = extractCodeContext(filePath, error.line, 5);
      const ctxText  = ctx || rawOutput.split('\n').slice(-30).join('\n');

      const explanation = await explainError(error.raw, ctxText, language, outputLang);

      let sessionId: string | null = null;
      if (firebase) {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        sessionId = await logErrorSession(error, explanation, ws, model);
      }

      writeToOutputChannel(explanation, {
        language, errorType: error.errorType,
        file: error.file, line: error.line
      }, sessionId);

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      getOrCreateOutputChannel().appendLine(`❌ AI explanation failed: ${msg}`);

      vscode.window.showErrorMessage(
        `Compiler Translator: ${msg}`, 'Configure'
      ).then(s => {
        if (s === 'Configure') {
          vscode.commands.executeCommand('compilerTranslator.configure');
        }
      });
    }
  }

  setState('error');
}

// ─── Other commands ───────────────────────────────────────────────────────────

async function cmdExplainLast(): Promise<void> {
  if (lastErrors.length === 0) {
    // Check selected text
    const sel = vscode.window.activeTextEditor?.selection;
    const doc = vscode.window.activeTextEditor?.document;
    if (sel && doc && !sel.isEmpty) {
      const txt  = doc.getText(sel);
      const errs = detectErrors(txt);
      if (errs.length) { lastErrors = errs; lastOutput = txt; }
    }
  }

  if (lastErrors.length === 0) {
    vscode.window.showInformationMessage(
      '🤖 No errors yet. Press Ctrl+Shift+R to run your file — errors will be explained automatically!'
    );
    return;
  }

  busy = true;
  try {
    const lang = lastErrors[0]?.language !== 'Unknown'
      ? lastErrors[0]?.language : detectLanguageFromEditor();
    await explainAndLog(lastErrors, lastOutput, lang);
  } finally {
    busy = false;
  }
}

async function cmdToggle(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('compilerTranslator');
  const cur = cfg.get<boolean>('autoExplain') ?? true;
  await cfg.update('autoExplain', !cur, vscode.ConfigurationTarget.Global);
  watcher?.setEnabled(!cur);
  vscode.window.showInformationMessage(
    `🤖 Auto-explain ${!cur ? 'ON ✅' : 'OFF ❌'}`
  );
}

async function cmdClear(): Promise<void> {
  lastErrors = []; lastOutput = '';
  const ch = getOrCreateOutputChannel();
  ch.clear();
  ch.appendLine('🗑️ Cleared. Press Ctrl+Shift+R to run your file.');
  setState('idle');
}

async function cmdHistory(): Promise<void> {
  const { getRecentSessions } = await import('./firebaseService');
  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: '🤖 Loading history…', cancellable: false },
    async () => {
      const sessions = await getRecentSessions(10);
      if (!sessions.length) {
        vscode.window.showInformationMessage('No Firebase history yet.');
        return;
      }
      const ch = getOrCreateOutputChannel();
      ch.show();
      ch.appendLine('══════ 📋 Firebase Error History ══════');
      for (const s of sessions) {
        ch.appendLine(`🔴 ${s.language} — ${s.errorType}`);
        ch.appendLine(`   ${s.errorMessage.slice(0, 100)}`);
        ch.appendLine(`   AI: ${s.aiExplanation.slice(0, 150)}…`);
        ch.appendLine('');
      }
    }
  );
}

async function cmdConfigure(): Promise<void> {
  const pick = await vscode.window.showQuickPick([
    { label: '🔑 Set Groq API Keys',         detail: 'Add your own keys (3 built-in already)' },
    { label: '🤖 Change AI Model',            detail: 'LLaMA 3.3, Mixtral, Gemma2…' },
    { label: '🌍 Change Explanation Language', detail: 'English, Bangla, Spanish…' },
    { label: '💾 Toggle Auto-Run on Save',     detail: 'Auto-run file every time you save' },
    { label: '⚙️ Open Full Settings',          detail: 'VS Code settings panel' },
  ], { placeHolder: 'Compiler Translator — Configure' });

  if (!pick) { return; }

  const cfg = vscode.workspace.getConfiguration('compilerTranslator');

  if (pick.label.includes('API Keys')) {
    const keys = await vscode.window.showInputBox({
      prompt: 'Groq API keys (comma-separated)',
      placeHolder: 'gsk_key1, gsk_key2',
      password: true
    });
    if (keys) {
      const list = keys.split(',').map(k => k.trim()).filter(Boolean);
      await cfg.update('groqApiKeys', list, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`✅ Saved ${list.length} keys.`);
    }
  } else if (pick.label.includes('Model')) {
    const m = await vscode.window.showQuickPick(
      ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
      { placeHolder: 'Select model' }
    );
    if (m) {
      await cfg.update('groqModel', m, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`✅ Model: ${m}`);
    }
  } else if (pick.label.includes('Language')) {
    const l = await vscode.window.showQuickPick(
      ['English', 'Bangla', 'Spanish', 'French', 'Hindi', 'Arabic'],
      { placeHolder: 'Explanation language' }
    );
    if (l) {
      await cfg.update('language', l, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`✅ Language: ${l}`);
    }
  } else if (pick.label.includes('Auto-Run')) {
    const cur = cfg.get<boolean>('autoRunOnSave') ?? false;
    await cfg.update('autoRunOnSave', !cur, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      `💾 Auto-run on save: ${!cur ? 'ON ✅' : 'OFF ❌'}`
    );
  } else {
    vscode.commands.executeCommand('workbench.action.openSettings', '@ext:rahat300809.compiler-translator');
  }
}

// ─── Status bar ───────────────────────────────────────────────────────────────

function setState(s: 'idle' | 'analyzing' | 'explaining' | 'error'): void {
  const M = {
    idle:      { t: '$(robot) CT',                  tip: 'Compiler Translator — watching all terminals',    bg: undefined },
    analyzing: { t: '$(loading~spin) CT: Running…', tip: 'Running your code…',                             bg: new vscode.ThemeColor('statusBarItem.warningBackground') },
    explaining:{ t: '$(loading~spin) CT: AI…',      tip: 'Groq AI is explaining the error…',              bg: new vscode.ThemeColor('statusBarItem.warningBackground') },
    error:     { t: '$(error) CT: See Output ↗',    tip: 'Error explained — click to open Output panel',  bg: new vscode.ThemeColor('statusBarItem.errorBackground') },
  };
  const m = M[s];
  barState.text            = m.t;
  barState.tooltip         = m.tip;
  barState.backgroundColor = m.bg;
}

// ─── Run terminal ────────────────────────────────────────────────────────────

let runTerm: vscode.Terminal | null = null;
function getRunTerminal(): vscode.Terminal {
  const name = '▶ Run Output';
  const ex   = vscode.window.terminals.find(t => t.name === name);
  if (ex) { return runTerm = ex; }
  return runTerm = vscode.window.createTerminal({
    name, iconPath: new vscode.ThemeIcon('play'),
    color: new vscode.ThemeColor('terminal.ansiGreen')
  });
}

// ─── Deactivate ──────────────────────────────────────────────────────────────

export function deactivate(): void {
  watcher?.dispose();
  disposeOutputs();
  runTerm?.dispose();
}
