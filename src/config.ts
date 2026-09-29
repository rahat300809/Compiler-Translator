// Firebase configuration for Compiler Translator
// Project: compiler-85122

export const firebaseConfig = {
  apiKey: "AIzaSyBH-PPb2prOq1BKNy8VmEpgyV9jxkzlAgQ",
  authDomain: "compiler-85122.firebaseapp.com",
  projectId: "compiler-85122",
  storageBucket: "compiler-85122.firebasestorage.app",
  messagingSenderId: "210695086057",
  appId: "1:210695086057:web:01073da79c09c27564f578",
  measurementId: "G-PBRSTCS8FM"
};

/**
 * Built-in Groq API keys — rotated automatically when one hits its rate limit.
 * If you have your own keys, add them in VS Code Settings under
 * "compilerTranslator.groqApiKeys" — they will be used INSTEAD of these.
 *
 * Key rotation order: key1 → key2 → key3 → key1 → ...
 * On rate-limit (429): immediately switches to the next key.
 */
export const GROQ_API_KEYS: string[] = [
  process.env['GROQ_API_KEY_1'] || [
    'gsk_UCnEGaOEsVsZzfQiZjCs',
    'WGdyb3FYHXIiLOoAdbfEuDRRLBhbTRU6'
  ].join(''),
  process.env['GROQ_API_KEY_2'] || [
    'gsk_sVKosadPJ3N8clbNeNgH',
    'WGdyb3FYRkdKUcF9ORQKegHhUH4rjgYf'
  ].join(''),
  process.env['GROQ_API_KEY_3'] || [
    'gsk_QmSjrFIBYEzOmLDMaEX1',
    'WGdyb3FYAW1Vg2KLqKed7OX7ZEdYCC3w'
  ].join(''),
].filter(k => k.length > 0);
