/**
 * Groq AI client with smart API key rotation & automatic model fallback.
 *
 * Supported verified models on current Groq keys:
 *  - openai/gpt-oss-120b (Primary 120B reasoning model)
 *  - openai/gpt-oss-20b
 *  - qwen/qwen3.8-27b
 *
 * Strategy:
 *  - 3 built-in keys rotated in round-robin order
 *  - Auto-retries next model if 404 (model_not_found) occurs
 *  - On HTTP 429 (rate limit): mark key as cooling down for 60s
 *  - Try ALL available keys before giving up
 */

import * as vscode from 'vscode';
import { GROQ_API_KEYS } from './config';

export const SUPPORTED_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
];

export const DEFAULT_MODEL = 'openai/gpt-oss-120b';

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqChoice {
  message: { content: string };
}

interface GroqResponse {
  choices: GroqChoice[];
}

// ─── Key rotation state ───────────────────────────────────────────────────────
const KEY_COOLDOWN_MS = 60_000;
const keyCooldowns = new Map<number, number>();
let lastUsedKeyIndex = 0;

function getActiveKeys(): string[] {
  const config = vscode.workspace.getConfiguration('compilerTranslator');
  const userKeys: string[] = config.get('groqApiKeys') || [];
  return userKeys.length > 0 ? userKeys : GROQ_API_KEYS;
}

function getAvailableKeyIndex(keys: string[]): number {
  const now = Date.now();
  const total = keys.length;

  for (let offset = 1; offset <= total; offset++) {
    const idx = (lastUsedKeyIndex + offset) % total;
    const cooldownEnd = keyCooldowns.get(idx) || 0;
    if (now >= cooldownEnd) {
      return idx;
    }
  }

  let soonestIdx = 0;
  let soonestEnd = Infinity;
  for (let i = 0; i < total; i++) {
    const end = keyCooldowns.get(i) || 0;
    if (end < soonestEnd) {
      soonestEnd = end;
      soonestIdx = i;
    }
  }
  return soonestIdx;
}

function markKeyCoolingDown(keyIndex: number): void {
  keyCooldowns.set(keyIndex, Date.now() + KEY_COOLDOWN_MS);
  console.warn(`[Compiler Translator] Key #${keyIndex + 1} rate-limited — cooling down for 60s`);
}

// ─── Core API caller ──────────────────────────────────────────────────────────
async function callGroqAPI(
  messages: GroqMessage[],
  preferredModel: string
): Promise<string> {
  const keys = getActiveKeys();

  if (keys.length === 0) {
    vscode.window.showErrorMessage(
      '🔑 Compiler Translator: No Groq API keys configured.',
      'Configure'
    ).then(action => {
      if (action === 'Configure') {
        vscode.commands.executeCommand('compilerTranslator.configure');
      }
    });
    throw new Error('No Groq API keys configured.');
  }

  // Model cascade: try user preferred model, then known working models
  const modelsToTry = [
    preferredModel,
    DEFAULT_MODEL,
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b'
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const keyIndex = getAvailableKeyIndex(keys);
      lastUsedKeyIndex = keyIndex;
      const apiKey = keys[keyIndex];

      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: 1024,
            temperature: 0.3,
            stream: false
          })
        });

        if (!response.ok) {
          const errorBody = await response.text();

          if (response.status === 404) {
            // Model not found on this account — try next candidate model!
            console.warn(`[CT] Model ${model} not available (404), trying fallback...`);
            lastError = new Error(`Model ${model} not found`);
            break; // break inner loop to try next model in outer loop
          }

          if (response.status === 429) {
            markKeyCoolingDown(keyIndex);
            lastError = new Error(`Key #${keyIndex + 1} rate limited`);
            continue; // try next key
          }

          if (response.status === 401) {
            throw new Error(`Key #${keyIndex + 1} is invalid or expired.`);
          }

          throw new Error(`Groq API error ${response.status}: ${errorBody.slice(0, 200)}`);
        }

        const data = await response.json() as GroqResponse;
        const content = data.choices[0]?.message?.content;

        if (!content) {
          throw new Error('Groq returned an empty response.');
        }

        keyCooldowns.delete(keyIndex);
        return content;

      } catch (err) {
        if (err instanceof Error && err.message.includes('rate limited')) {
          lastError = err;
          continue;
        }
        if (err instanceof Error && err.message.includes('not found')) {
          break; // try next model
        }
        throw err;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('Failed to get explanation from Groq AI.');
}

// ─── Explain Error with source code context ───────────────────────────────────
export async function explainError(
  errorText: string,
  codeContext: string,
  language: string,
  outputLanguage: string = 'English'
): Promise<string> {
  const config = vscode.workspace.getConfiguration('compilerTranslator');
  const model: string = config.get('groqModel') || DEFAULT_MODEL;

  const systemPrompt = `You are an expert programming mentor inside VS Code.
Your job is to explain compiler/runtime errors clearly and show how to fix them.

Rules:
1. Start with a ONE-LINE plain summary of what went wrong (no complicated jargon).
2. Point out the exact line and mistake in the user's code.
3. Show the EXACT CORRECTED CODE snippet.
4. Explain WHY the fix works in simple, friendly terms.
5. If there are multiple errors, explain each clearly.
6. Write your explanation in ${outputLanguage}.
7. Use emojis: ✅ for fix, ❌ for error line, 💡 for helpful tip.
8. Keep response under 300 words.`;

  let userPrompt = `I got this error when running my ${language} code:\n\n\`\`\`\n${errorText}\n\`\`\``;

  if (codeContext && codeContext.trim()) {
    userPrompt += `\n\nHere is my source code:\n\`\`\`${language}\n${codeContext}\n\`\`\``;
  }

  userPrompt += `\n\nPlease explain what went wrong and provide the exact fix.`;

  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  return await callGroqAPI(messages, model);
}

export async function quickSuggest(errorLine: string): Promise<string> {
  const config = vscode.workspace.getConfiguration('compilerTranslator');
  const model: string = config.get('groqModel') || DEFAULT_MODEL;

  const messages: GroqMessage[] = [
    {
      role: 'system',
      content: 'Give a single-line fix suggestion for this error. Max 20 words. No preamble.'
    },
    { role: 'user', content: errorLine }
  ];

  return await callGroqAPI(messages, model);
}
