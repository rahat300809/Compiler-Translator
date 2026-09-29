/**
 * Groq AI client with automatic API key rotation.
 * Uses 3 keys in round-robin; falls back to next key on rate-limit errors.
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

let currentKeyIndex = 0;

function getNextKey(): string {
  const config = vscode.workspace.getConfiguration('compilerTranslator');
  const userKeys: string[] = config.get('groqApiKeys') || [];
  const keys = userKeys.length > 0 ? userKeys : GROQ_API_KEYS;
  
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
    throw new Error('No Groq API keys configured. Click "Add Keys Now" in the notification.');
  }

  const key = keys[currentKeyIndex % keys.length];
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  return key;
}

async function callGroqAPI(
  messages: GroqMessage[],
  model: string,
  retries: number = 3
): Promise<string> {
  let lastError: Error | null = null;
  
  const config = vscode.workspace.getConfiguration('compilerTranslator');
  const userKeys: string[] = config.get('groqApiKeys') || [];
  const keys = userKeys.length > 0 ? userKeys : GROQ_API_KEYS;
  const maxAttempts = Math.min(retries, keys.length);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = getNextKey();
    
    try {
      // Use dynamic import for node-fetch compatibility
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
          // Rate limited — try next key
          console.warn(`[Compiler Translator] Key ${attempt + 1} rate limited, trying next...`);
          lastError = new Error(`Rate limited: ${errorBody}`);
          continue;
        }
        throw new Error(`Groq API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json() as GroqResponse;
      return data.choices[0]?.message?.content || 'No explanation available.';

    } catch (error) {
      if (error instanceof Error && error.message.includes('Rate limited')) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('All API keys exhausted or failed.');
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
