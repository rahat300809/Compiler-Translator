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
 * Default Groq API keys — loaded from environment variables or VS Code settings.
 *
 * HOW TO SET YOUR OWN KEYS:
 *   Option 1 (Recommended): VS Code Settings → "compilerTranslator.groqApiKeys"
 *   Option 2: Set environment variable GROQ_API_KEY_1, GROQ_API_KEY_2, GROQ_API_KEY_3
 *
 * Get free API keys at: https://console.groq.com
 */
export const GROQ_API_KEYS: string[] = [
  process.env['GROQ_API_KEY_1'] || '',
  process.env['GROQ_API_KEY_2'] || '',
  process.env['GROQ_API_KEY_3'] || '',
].filter(k => k.length > 0);
