/**
 * Groq AI client with smart API key rotation.
 *
 * Strategy:
 *  - 3 built-in keys rotated in round-robin order
 *  - On HTTP 429 (rate limit): mark key as "cooling down" for 60s
 *  - Skip cooling-down keys automatically
 *  - Try ALL available keys before giving up
 *  - Shows VS Code status info when switching keys
 */

import * as vscode from 'vscode';
import { GROQ_API_KEYS } from './config';

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

const KEY_COOLDOWN_MS = 60_000; // 60 seconds cooldown after rate limit
const keyCooldowns = new Map<number, number>(); // keyIndex → cooldown end timestamp
let lastUsedKeyIndex = 0;

function getActiveKeys(): string[] {
  const config = vscode.workspace.getConfiguration('compilerTranslator');
  const userKeys: string[] = config.get('groqApiKeys') || [];
  return userKeys.length > 0 ? userKeys : GROQ_API_KEYS;
}

/**
 * Returns the next available key index, skipping ones in cooldown.
 * Tries all keys before returning -1 (all exhausted).
 */
function getAvailableKeyIndex(keys: string[]): number {
  const now = Date.now();
  const total = keys.length;

  for (let offset = 1; offset <= total; offset++) {
    const idx = (lastUsedKeyIndex + offset) % total;
    const cooldownEnd = keyCooldowns.get(idx) || 0;

    if (now >= cooldownEnd) {
      return idx; // this key is available
    }
  }

  // All keys cooling down — find the one that recovers soonest
  let soonestIdx = 0;
  let soonestEnd = Infinity;
  for (let i = 0; i < total; i++) {
    const end = keyCooldowns.get(i) || 0;
    if (end < soonestEnd) {
      soonestEnd = end;
      soonestIdx = i;
    }
  }

  return soonestIdx; // use whoever recovers first (might still fail, caller handles it)
}

function markKeyCoolingDown(keyIndex: number): void {
  keyCooldowns.set(keyIndex, Date.now() + KEY_COOLDOWN_MS);
  console.warn(`[Compiler Translator] Key #${keyIndex + 1} rate-limited — cooling down for 60s`);
}

// ─── Core API caller ──────────────────────────────────────────────────────────

async function callGroqAPI(
  messages: GroqMessage[],
  model: string
): Promise<string> {
  const keys = getActiveKeys();

  if (keys.length === 0) {
    vscode.window.showErrorMessage(
      '🔑 Compiler Translator: No Groq API keys configured.',
      'Add Keys Now',
      'Get Free Keys'
    ).then(action => {
      if (action === 'Add Keys Now') {
        vscode.commands.executeCommand('compilerTranslator.configure');
      } else if (action === 'Get Free Keys') {
        vscode.env.openExternal(vscode.Uri.parse('https://console.groq.com'));
      }
    });
    throw new Error('No Groq API keys configured.');
  }

  let lastError: Error | null = null;

  // Try every key (up to keys.length attempts)
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIndex = getAvailableKeyIndex(keys);
    lastUsedKeyIndex = keyIndex;
    const apiKey = keys[keyIndex];

    if (attempt > 0) {
      // Notify user we switched keys
      vscode.window.setStatusBarMessage(
        `🔄 Compiler Translator: Switching to API key #${keyIndex + 1}...`,
        3000
      );
    }

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

        if (response.status === 429) {
          // Rate limited — cool down this key and try the next one
          markKeyCoolingDown(keyIndex);
          lastError = new Error(`Key #${keyIndex + 1} rate limited`);
          continue; // try next key
        }

        if (response.status === 401) {
          throw new Error(`Key #${keyIndex + 1} is invalid or expired. Please update your API keys.`);
        }

        throw new Error(`Groq API error ${response.status}: ${errorBody.slice(0, 200)}`);
      }

      const data = await response.json() as GroqResponse;
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Groq returned an empty response.');
      }

      // Success — clear this key's cooldown if it had one
      keyCooldowns.delete(keyIndex);
      return content;

    } catch (err) {
      if (err instanceof Error && err.message.includes('rate limited')) {
        lastError = err;
        continue; // already marked cooling, try next
      }
      throw err; // non-rate-limit errors bubble up immediately
    }
  }

  // All keys exhausted
  const cooldownSecs = Math.ceil(KEY_COOLDOWN_MS / 1000);
  throw new Error(
    `All ${keys.length} API keys are rate-limited. ` +
    `They will recover in ~${cooldownSecs}s. ` +
    `Add more keys via Settings → Compiler Translator → Groq Api Keys.`
  );
}



export async function explainError(
  errorText: string,
  codeContext: string,
  language: string,
  outputLanguage: string = 'English'
): Promise<string> {
  const config = vscode.workspace.getConfiguration('compilerTranslator');
  const model: string = config.get('groqModel') || 'llama-3.3-70b-versatile';

  const systemPrompt = `You are a friendly programming mentor embedded in a developer's IDE.
Your job is to explain compiler/runtime errors in simple, human-friendly language.

Rules:
1. Start with a ONE-LINE plain summary of what went wrong (no jargon)
2. Then explain WHY it happened in simple terms
3. Then show the EXACT FIX with a code snippet if possible
4. If there are multiple errors, address each separately
5. Be encouraging and positive — like a helpful friend, not a cold error message
6. Respond in ${outputLanguage}
7. Use emojis sparingly to make it readable (✅ for fix, ❌ for problem, 💡 for tip)
8. Keep total response under 300 words`;

  const userPrompt = `I got this error in my ${language} code:

\`\`\`
${errorText}
\`\`\`

${codeContext ? `Here's the relevant code context:\n\`\`\`${language}\n${codeContext}\n\`\`\`` : ''}

Please explain what went wrong and how to fix it in simple terms.`;

  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  return await callGroqAPI(messages, model);
}

export async function quickSuggest(errorLine: string): Promise<string> {
  const config = vscode.workspace.getConfiguration('compilerTranslator');
  const model: string = config.get('groqModel') || 'llama-3.3-70b-versatile';

  const messages: GroqMessage[] = [
    {
      role: 'system',
      content: 'Give a single-line fix suggestion for this error. Max 20 words. No preamble.'
    },
    { role: 'user', content: errorLine }
  ];

  return await callGroqAPI(messages, model);
}
