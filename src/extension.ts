/**
 * Compiler Translator — Main Extension Entry Point
 *
 * Activates terminal watching, error detection, Groq AI explanation,
 * and Firebase logging when the extension loads in VS Code.
 *
 * Author: rahat300809
 * Repo: https://github.com/rahat300809/Compiler-Translator
 */

import * as vscode from 'vscode';
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

// ─── State ────────────────────────────────────────────────────────────────────

let terminalWatcher: TerminalWatcher | null = null;
let statusBarItem: vscode.StatusBarItem;
let lastDetectedErrors: DetectedError[] = [];
let lastRawOutput: string = '';
let isProcessing = false;

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  console.log('[Compiler Translator] Extension activated!');

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'compilerTranslator.explainLast';
  setStatusBar('idle');
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Initialize terminal watcher
  terminalWatcher = new TerminalWatcher(handleErrorsDetected);
  terminalWatcher.start();
  context.subscriptions.push({ dispose: () => terminalWatcher?.dispose() });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('compilerTranslator.explainLast', cmdExplainLast),
    vscode.commands.registerCommand('compilerTranslator.toggleAutoExplain', cmdToggleAutoExplain),
    vscode.commands.registerCommand('compilerTranslator.clearHistory', cmdClearHistory),
    vscode.commands.registerCommand('compilerTranslator.showHistory', cmdShowHistory),
    vscode.commands.registerCommand('compilerTranslator.configure', cmdConfigure)
  );

  // Output channel
  context.subscriptions.push({ dispose: () => disposeOutputs() });

  // Welcome message
  const channel = getOrCreateOutputChannel();
  channel.appendLine('═══════════════════════════════════════════════════════════');
  channel.appendLine('  🤖 Compiler Translator — AI Error Explainer v1.0.0');
  channel.appendLine('  Powered by Groq AI + Firebase');
  channel.appendLine('  Watching terminal for errors... (all languages supported)');
  channel.appendLine('  Press Ctrl+Shift+E to explain the last error manually.');
  channel.appendLine('═══════════════════════════════════════════════════════════');
  channel.appendLine('');

  vscode.window.showInformationMessage(
    '🤖 Compiler Translator is active! Watching your terminal for errors.',
    'Open Panel'
  ).then(selection => {
    if (selection === 'Open Panel') {
      channel.show();
    }
  });
}

// ─── Core Error Handler ───────────────────────────────────────────────────────

async function handleErrorsDetected(
  errors: DetectedError[],
  rawOutput: string,
  _terminal: vscode.Terminal
): Promise<void> {
  const config = vscode.workspace.getConfiguration('compilerTranslator');
  const autoExplain: boolean = config.get('autoExplain') ?? true;

  // Store for manual re-explain
  lastDetectedErrors = errors;
  lastRawOutput = rawOutput;

  if (!autoExplain || isProcessing) { return; }

  await processAndExplainErrors(errors, rawOutput);
}

async function processAndExplainErrors(
  errors: DetectedError[],
  rawOutput: string
): Promise<void> {
  if (isProcessing) { return; }
  isProcessing = true;

  const config = vscode.workspace.getConfiguration('compilerTranslator');
  const enableFirebase: boolean = config.get('enableFirebase') ?? true;
  const outputLang: string = config.get('language') ?? 'English';
  const maxContextLines: number = config.get('maxContextLines') ?? 50;

  setStatusBar('analyzing');
  showProcessingMessage();

  // Process up to 3 errors at once
  const errorsToProcess = errors.slice(0, 3);

  for (const error of errorsToProcess) {
    try {
      // Get language from editor or detected error
      const editorLang = detectLanguageFromEditor();
      const language = error.language !== 'Unknown' ? error.language : editorLang;

      // Get code context from file if possible
      const codeContext = extractCodeContext(error.file, error.line, maxContextLines / 10);

      // Build full context for AI
      const contextLines = rawOutput.split('\n').slice(-maxContextLines).join('\n');
      const errorContext = codeContext || contextLines;

      setStatusBar('explaining');

      // Call Groq AI
      const explanation = await explainError(
        error.raw,
        errorContext,
        language,
        outputLang
      );

      // Write to Output Channel (main delivery method)
      const model = config.get<string>('groqModel') || 'llama-3.3-70b-versatile';
      let sessionId: string | null = null;

      // Log to Firebase
      if (enableFirebase) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        sessionId = await logErrorSession(error, explanation, workspaceFolder, model);
      }

      writeToOutputChannel(explanation, {
        language,
        errorType: error.errorType,
        file: error.file,
        line: error.line
      }, sessionId);

      // Show notification for fatal errors
      if (error.severity === 'fatal') {
        vscode.window.showWarningMessage(
          `💥 Fatal error detected in ${language}. Check "Compiler Translator" output panel for explanation.`,
          'View'
        ).then(sel => {
          if (sel === 'View') { getOrCreateOutputChannel().show(); }
        });
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[Compiler Translator] Failed to explain error:', errorMsg);

      const channel = getOrCreateOutputChannel();
      channel.appendLine('');
      channel.appendLine(`❌ Failed to get AI explanation: ${errorMsg}`);
      channel.appendLine('   Check your internet connection and API keys in settings.');
      channel.appendLine('');

      vscode.window.showErrorMessage(
        `Compiler Translator: ${errorMsg}`,
        'Configure Keys'
      ).then(sel => {
        if (sel === 'Configure Keys') {
          vscode.commands.executeCommand('compilerTranslator.configure');
        }
      });
    }
  }

  setStatusBar(errors.length > 0 ? 'error' : 'idle');
  isProcessing = false;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdExplainLast(): Promise<void> {
  if (lastDetectedErrors.length === 0) {
    // Try to parse selected text or clipboard
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      const selected = editor.document.getText(editor.selection);
      const errors = detectErrors(selected);
      if (errors.length > 0) {
        lastDetectedErrors = errors;
        lastRawOutput = selected;
      } else {
        vscode.window.showInformationMessage(
          '🤖 No errors detected yet. Run your code and errors will be explained automatically!'
        );
        return;
      }
    } else {
      vscode.window.showInformationMessage(
        '🤖 No errors detected yet. Run your code and errors will be explained automatically!\n\nTip: You can also select error text and press Ctrl+Shift+E.'
      );
      return;
    }
  }

  await processAndExplainErrors(lastDetectedErrors, lastRawOutput);
}

async function cmdToggleAutoExplain(): Promise<void> {
  const config = vscode.workspace.getConfiguration('compilerTranslator');
  const current = config.get<boolean>('autoExplain') ?? true;
  await config.update('autoExplain', !current, vscode.ConfigurationTarget.Global);

  const newState = !current;
  terminalWatcher?.setEnabled(newState);
  setStatusBar(newState ? 'idle' : 'disabled');

  vscode.window.showInformationMessage(
    `🤖 Compiler Translator: Auto-explain ${newState ? 'ENABLED ✅' : 'DISABLED ❌'}`
  );
}

async function cmdClearHistory(): Promise<void> {
  lastDetectedErrors = [];
  lastRawOutput = '';
  const channel = getOrCreateOutputChannel();
  channel.clear();
  channel.appendLine('🗑️ Error history cleared.');
  setStatusBar('idle');
  vscode.window.showInformationMessage('🗑️ Compiler Translator: History cleared.');
}

async function cmdShowHistory(): Promise<void> {
  const { getRecentSessions } = await import('./firebaseService');

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: '🤖 Fetching error history from Firebase...',
      cancellable: false
    },
    async () => {
      const sessions = await getRecentSessions(10);

      if (sessions.length === 0) {
        vscode.window.showInformationMessage('No error history found in Firebase.');
        return;
      }

      const channel = getOrCreateOutputChannel();
      channel.show();
      channel.appendLine('');
      channel.appendLine('═══════════════════════════════════════════════════════════');
      channel.appendLine('  📋 Recent Error History (from Firebase)');
      channel.appendLine('═══════════════════════════════════════════════════════════');
      channel.appendLine('');

      for (const session of sessions) {
        const ts = session.timestamp instanceof Date
          ? session.timestamp.toLocaleString()
          : 'Unknown time';

        channel.appendLine(`🔴 [${ts}] ${session.language} — ${session.errorType}`);
        channel.appendLine(`   ${session.errorMessage.slice(0, 100)}`);
        channel.appendLine(`   AI: ${session.aiExplanation.slice(0, 150)}...`);
        channel.appendLine('');
      }
    }
  );
}

async function cmdConfigure(): Promise<void> {
  const action = await vscode.window.showQuickPick(
    [
      { label: '🔑 Set Custom Groq API Keys', detail: 'Add your own Groq API keys' },
      { label: '🤖 Change AI Model', detail: 'Select which Groq model to use' },
      { label: '🌍 Change Explanation Language', detail: 'Get explanations in your language' },
      { label: '⚙️ Open Full Settings', detail: 'Open VS Code settings for this extension' },
    ],
    { placeHolder: 'Configure Compiler Translator' }
  );

  if (!action) { return; }

  if (action.label.includes('API Keys')) {
    const keys = await vscode.window.showInputBox({
      prompt: 'Enter Groq API keys separated by commas',
      placeHolder: 'gsk_key1, gsk_key2, gsk_key3',
      password: true
    });
    if (keys) {
      const keyList = keys.split(',').map(k => k.trim()).filter(Boolean);
      await vscode.workspace.getConfiguration('compilerTranslator').update(
        'groqApiKeys', keyList, vscode.ConfigurationTarget.Global
      );
      vscode.window.showInformationMessage(`✅ Saved ${keyList.length} API key(s).`);
    }
  } else if (action.label.includes('Model')) {
    const model = await vscode.window.showQuickPick(
      ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
      { placeHolder: 'Select Groq model' }
    );
    if (model) {
      await vscode.workspace.getConfiguration('compilerTranslator').update(
        'groqModel', model, vscode.ConfigurationTarget.Global
      );
      vscode.window.showInformationMessage(`✅ Model set to ${model}`);
    }
  } else if (action.label.includes('Language')) {
    const lang = await vscode.window.showQuickPick(
      ['English', 'Bangla', 'Spanish', 'French', 'Hindi', 'Arabic'],
      { placeHolder: 'Select explanation language' }
    );
    if (lang) {
      await vscode.workspace.getConfiguration('compilerTranslator').update(
        'language', lang, vscode.ConfigurationTarget.Global
      );
      vscode.window.showInformationMessage(`✅ Explanations will now be in ${lang}`);
    }
  } else {
    vscode.commands.executeCommand(
      'workbench.action.openSettings',
      '@ext:rahat300809.compiler-translator'
    );
  }
}

// ─── Status Bar Helpers ───────────────────────────────────────────────────────

function setStatusBar(state: 'idle' | 'analyzing' | 'explaining' | 'error' | 'disabled'): void {
  const states = {
    idle: { text: '$(robot) CT: Ready', tooltip: 'Compiler Translator: Watching terminal', color: undefined },
    analyzing: { text: '$(loading~spin) CT: Detecting...', tooltip: 'Analyzing terminal output', color: new vscode.ThemeColor('statusBarItem.warningBackground') },
    explaining: { text: '$(loading~spin) CT: Asking AI...', tooltip: 'Getting AI explanation from Groq', color: new vscode.ThemeColor('statusBarItem.warningBackground') },
    error: { text: '$(error) CT: Error Explained', tooltip: 'Error explained — click to see', color: new vscode.ThemeColor('statusBarItem.errorBackground') },
    disabled: { text: '$(robot) CT: Disabled', tooltip: 'Auto-explain disabled. Click to explain manually.', color: undefined }
  };

  const s = states[state];
  statusBarItem.text = s.text;
  statusBarItem.tooltip = s.tooltip;
  statusBarItem.backgroundColor = s.color;
}

// ─── Deactivation ────────────────────────────────────────────────────────────

export function deactivate(): void {
  terminalWatcher?.dispose();
  disposeOutputs();
  console.log('[Compiler Translator] Extension deactivated.');
}
