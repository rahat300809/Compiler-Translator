/**
 * Code Runner — executes the current file using child_process,
 * captures REAL stdout/stderr, shows output in terminal,
 * and sends errors to Groq AI for explanation.
 *
 * This is MORE reliable than terminal interception because we
 * control the process directly.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  language: string;
  command: string;
  duration: number;  // ms
}

// Language → run command mapping
const RUNNER_MAP: Record<string, (filePath: string, dir: string) => string> = {
  python:     (f) => `python "${f}"`,
  python3:    (f) => `python "${f}"`,
  javascript: (f) => `node "${f}"`,
  typescript: (f) => `ts-node "${f}"`,
  java:       (f, d) => `javac "${f}" && java -cp "${d}" "${path.basename(f, '.java')}"`,
  c:          (f, d) => `gcc "${f}" -o "${path.join(d, 'a.out')}" && "${path.join(d, 'a.out')}"`,
  cpp:        (f, d) => `g++ "${f}" -o "${path.join(d, 'a.out')}" && "${path.join(d, 'a.out')}"`,
  csharp:     (f) => `dotnet script "${f}"`,
  go:         (f) => `go run "${f}"`,
  rust:       (f, d) => `rustc "${f}" -o "${path.join(d, 'output')}" && "${path.join(d, 'output')}"`,
  php:        (f) => `php "${f}"`,
  ruby:       (f) => `ruby "${f}"`,
  kotlin:     (f) => `kotlinc "${f}" -include-runtime -d out.jar && java -jar out.jar`,
  r:          (f) => `Rscript "${f}"`,
  bash:       (f) => `bash "${f}"`,
  powershell: (f) => `pwsh "${f}"`,
  perl:       (f) => `perl "${f}"`,
  lua:        (f) => `lua "${f}"`,
  swift:      (f) => `swift "${f}"`,
  dart:       (f) => `dart "${f}"`,
};

const LANG_DISPLAY: Record<string, string> = {
  python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript',
  java: 'Java', c: 'C', cpp: 'C++', csharp: 'C#', go: 'Go', rust: 'Rust',
  php: 'PHP', ruby: 'Ruby', kotlin: 'Kotlin', r: 'R', bash: 'Bash',
  powershell: 'PowerShell', perl: 'Perl', lua: 'Lua', swift: 'Swift', dart: 'Dart'
};

export async function runCurrentFile(): Promise<RunResult | null> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('🤖 Open a code file first to run it.');
    return null;
  }

  // Save file first
  await editor.document.save();

  const filePath = editor.document.fileName;
  const fileDir  = path.dirname(filePath);
  const langId   = editor.document.languageId;
  const language = LANG_DISPLAY[langId] || langId;

  const commandFn = RUNNER_MAP[langId];
  if (!commandFn) {
    vscode.window.showWarningMessage(
      `🤖 Language "${language}" is not directly supported for Run & Explain.\n` +
      `Run your code manually in the terminal — errors will still be detected.`
    );
    return null;
  }

  const command = commandFn(filePath, fileDir);

  return new Promise((resolve) => {
    const start = Date.now();

    // Show real output in a dedicated terminal  
    const runTerminal = getOrCreateRunTerminal();
    runTerminal.show(false);

    // Echo the command being run
    runTerminal.sendText(
      `echo "" && echo "▶ Running: ${language} — ${path.basename(filePath)}" && echo "────────────────────────────────────"`,
      true
    );
    runTerminal.sendText(command, true);

    // ALSO capture output via child_process for AI analysis
    cp.exec(
      command,
      {
        cwd: fileDir,
        timeout: 30000, // 30s max
        maxBuffer: 1024 * 1024 // 1MB
      },
      (error, stdout, stderr) => {
        const duration = Date.now() - start;
        const exitCode = error?.code ?? 0;
        const combinedOutput = [stdout, stderr].filter(Boolean).join('\n');

        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: exitCode || (error ? 1 : 0),
          language,
          command,
          duration
        });
      }
    );
  });
}

let runTerminal: vscode.Terminal | null = null;
const RUN_TERMINAL_NAME = '▶ Run Output';

function getOrCreateRunTerminal(): vscode.Terminal {
  const existing = vscode.window.terminals.find(t => t.name === RUN_TERMINAL_NAME);
  if (existing) {
    runTerminal = existing;
    return existing;
  }
  runTerminal = vscode.window.createTerminal({
    name: RUN_TERMINAL_NAME,
    iconPath: new vscode.ThemeIcon('play'),
    color: new vscode.ThemeColor('terminal.ansiGreen')
  });
  return runTerminal;
}

export function disposeRunTerminal(): void {
  runTerminal?.dispose();
  runTerminal = null;
}
