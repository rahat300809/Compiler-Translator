/**
 * Output Panel — writes AI explanations to the "Compiler Translator" Output Channel.
 * The Output Channel is shown ALONGSIDE your terminal so real output is preserved.
 */

import * as vscode from 'vscode';

const CHANNEL_NAME = 'Compiler Translator';
let channel: vscode.OutputChannel | null = null;

export function getOrCreateOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel(CHANNEL_NAME);
  }
  return channel;
}

export function writeToOutputChannel(
  explanation: string,
  info: { language: string; errorType: string; file?: string; line?: number },
  sessionId?: string | null
): void {
  const ch  = getOrCreateOutputChannel();
  const ts  = new Date().toLocaleTimeString();
  const sep = '─'.repeat(60);
  const loc = info.file
    ? `${info.file.split(/[\\/]/).pop()}${info.line ? `:${info.line}` : ''}`
    : 'terminal';

  ch.appendLine('');
  ch.appendLine(sep);
  ch.appendLine(`🤖 AI Explanation  [${ts}]`);
  ch.appendLine(`   Language: ${info.language}  |  Error: ${info.errorType}  |  ${loc}`);
  ch.appendLine(sep);
  ch.appendLine('');
  ch.appendLine(explanation);
  ch.appendLine('');
  if (sessionId) {
    ch.appendLine(`📌 Firebase ID: ${sessionId}`);
  }
  ch.appendLine(sep);
  ch.appendLine('');

  // Auto-show the output channel
  ch.show(false); // false = don't steal editor focus
}

export function showProcessingMessage(): void {
  const ch = getOrCreateOutputChannel();
  ch.appendLine('⏳ Asking Groq AI to explain the error…');
}

export function disposeOutputs(): void {
  channel?.dispose();
  channel = null;
}
