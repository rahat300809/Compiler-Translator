/**
 * Firebase service — fully safe, lazy-loaded.
 * If Firebase fails for ANY reason, all functions return null/[]
 * so the extension continues working without errors.
 */

import { firebaseConfig } from './config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

let initialized = false;
let fbModules: Record<string, AnyFn> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;

async function ensureFirebase(): Promise<boolean> {
  if (initialized) { return fbModules !== null; }
  initialized = true;

  try {
    const { initializeApp }  = await import('firebase/app');
    const firestore          = await import('firebase/firestore');

    const app = initializeApp(firebaseConfig);
    db = firestore.getFirestore(app);
    fbModules = firestore as unknown as Record<string, AnyFn>;

    console.log('[CT] Firebase initialized');
    return true;
  } catch (e) {
    console.warn('[CT] Firebase not available (offline or config error):', (e as Error).message);
    return false;
  }
}

export interface ErrorSession {
  id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timestamp: any;
  language: string;
  errorType: string;
  errorMessage: string;
  file?: string;
  line?: number;
  aiExplanation: string;
  workspaceFolder?: string;
  model: string;
  resolved?: boolean;
}

export async function logErrorSession(
  error: { language: string; errorType: string; message: string; file?: string; line?: number },
  aiExplanation: string,
  workspaceFolder: string | undefined,
  model: string
): Promise<string | null> {
  const ok = await ensureFirebase();
  if (!ok || !db || !fbModules) { return null; }

  try {
    const { collection, addDoc, serverTimestamp } = fbModules;
    const docRef = await addDoc(collection(db, 'errorSessions'), {
      timestamp: serverTimestamp(),
      language: error.language,
      errorType: error.errorType,
      errorMessage: (error.message || '').slice(0, 500),
      file: error.file,
      line: error.line,
      aiExplanation: aiExplanation.slice(0, 2000),
      workspaceFolder: workspaceFolder?.replace(/\\/g, '/'),
      model,
      resolved: false
    });
    return docRef.id as string;
  } catch (e) {
    console.warn('[CT] Firebase log failed:', (e as Error).message);
    return null;
  }
}

export async function getRecentSessions(limitCount = 10): Promise<ErrorSession[]> {
  const ok = await ensureFirebase();
  if (!ok || !db || !fbModules) { return []; }

  try {
    const { collection, query, orderBy, limit, getDocs } = fbModules;
    const q   = query(collection(db, 'errorSessions'), orderBy('timestamp', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as ErrorSession[];
  } catch (e) {
    console.warn('[CT] Firebase fetch failed:', (e as Error).message);
    return [];
  }
}
