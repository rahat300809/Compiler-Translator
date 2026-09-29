/**
 * Terminal Output Panel — writes AI explanations to a dedicated VS Code terminal.
 * Keeps real code output intact; AI explanation appears in a SEPARATE terminal tab.
 */

import * as vscode from 'vscode';

let explanationTerminal: vscode.Terminal | null = null;
let explanationChannel: vscode.OutputChannel | null = null;

const TERMINAL_NAME = '🤖 AI Error Explainer';
const CHANNEL_NAME = 'Compiler Translator';

export function getOrCreateOutputChannel(): vscode.OutputChannel {
  if (!explanationChannel) {
    explanationChannel = vscode.window.createOutputChannel(CHANNEL_NAME, 'markdown');
  }
  return explanationChannel;
}

export function getOrCreateExplanationTerminal(): vscode.Terminal {
  // Check if terminal still exists
  const existing = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);
  if (existing) {
    explanationTerminal = existing;
    return existing;
  }

  explanationTerminal = vscode.window.createTerminal({
    name: TERMINAL_NAME,
    isTransient: true,
    iconPath: new vscode.ThemeIcon('robot'),
    color: new vscode.ThemeColor('terminal.ansiCyan')
  });

  return explanationTerminal;
}

export function writeExplanationToTerminal(
  explanation: string,
  errorInfo: {
    language: string;
    errorType: string;
    file?: string;
    line?: number;
  },
  sessionId?: string | null
): void {
  const terminal = getOrCreateExplanationTerminal();
  terminal.show(false); // show but don't steal focus from code terminal

  const timestamp = new Date().toLocaleTimeString();
  const separator = '─'.repeat(60);

  // ANSI color codes for terminal
  const CYAN = '\x1b[36m';
  const YELLOW = '\x1b[33m';
  const GREEN = '\x1b[32m';
  const RED = '\x1b[31m';
  const BOLD = '\x1b[1m';
  const DIM = '\x1b[2m';
  const RESET = '\x1b[0m';

  const location = errorInfo.file
    ? `${errorInfo.file}${errorInfo.line ? `:${errorInfo.line}` : ''}`
    : 'terminal';

  // Build the output block
  const lines = [
    ``,
    `${CYAN}${BOLD}${separator}${RESET}`,
    `${YELLOW}${BOLD} 🤖 AI Error Explanation  ${DIM}[${timestamp}]${RESET}`,
    `${DIM} Language: ${errorInfo.language}  |  Error: ${errorInfo.errorType}  |  ${location}${RESET}`,
    `${CYAN}${separator}${RESET}`,
    ``,
    ...explanation.split('\n').map(line => ` ${line}`),
    ``,
    `${DIM}${CYAN}${separator}`,
    ` Firebase Session: ${sessionId || 'offline'} | Press Ctrl+Shift+E to re-explain${RESET}`,
    `${DIM}${CYAN}${separator}${RESET}`,
    ``
  ];

  // Send each line to the terminal
  for (const line of lines) {
    terminal.sendText(`echo "${escapeForEcho(line)}"`, true);
  }
}

export function writeToOutputChannel(
  explanation: string,
  errorInfo: {
    language: string;
    errorType: string;
    file?: string;
    line?: number;
  },
  sessionId?: string | null
): void {
  const channel = getOrCreateOutputChannel();
  channel.show(false);

  const timestamp = new Date().toLocaleTimeString();
  const separator = '─'.repeat(60);
  const location = errorInfo.file
    ? `${errorInfo.file}${errorInfo.line ? `:${errorInfo.line}` : ''}`
    : 'terminal output';

  channel.appendLine('');
  channel.appendLine(separator);
  channel.appendLine(`🤖 AI Error Explanation — ${timestamp}`);
  channel.appendLine(`   Language: ${errorInfo.language} | Error: ${errorInfo.errorType}`);
  channel.appendLine(`   Location: ${location}`);
  channel.appendLine(separator);
  channel.appendLine('');
  channel.appendLine(explanation);
  channel.appendLine('');
  channel.appendLine(`Firebase Session ID: ${sessionId || 'offline'}`);
  channel.appendLine(separator);
  channel.appendLine('');
}

export function showProcessingMessage(): void {
  const channel = getOrCreateOutputChannel();
  channel.show(false);
  channel.appendLine('');
  channel.appendLine('⏳ Analyzing error with Groq AI...');
}

export function disposeOutputs(): void {
  explanationChannel?.dispose();
  explanationChannel = null;
  explanationTerminal?.dispose();
  explanationTerminal = null;
}

function escapeForEcho(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}
