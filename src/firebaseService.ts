/**
 * Firebase service for logging error sessions.
 * Stores error history online for analytics and cross-device access.
 */

import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { firebaseConfig } from './config';
import type { DetectedError } from './errorDetector';

export interface ErrorSession {
  id?: string;
  timestamp: Date | Timestamp;
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

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let initialized = false;

function ensureInitialized(): boolean {
  if (initialized) { return true; }

  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    initialized = true;
    console.log('[Compiler Translator] Firebase initialized successfully');
    return true;
  } catch (error) {
    console.error('[Compiler Translator] Firebase initialization failed:', error);
    return false;
  }
}

export async function logErrorSession(
  error: DetectedError,
  aiExplanation: string,
  workspaceFolder: string | undefined,
  model: string
): Promise<string | null> {
  if (!ensureInitialized() || !db) { return null; }

  try {
    const session: Omit<ErrorSession, 'id'> = {
      timestamp: serverTimestamp() as Timestamp,
      language: error.language,
      errorType: error.errorType,
      errorMessage: error.message.slice(0, 500),
      file: error.file,
      line: error.line,
      aiExplanation: aiExplanation.slice(0, 2000),
      workspaceFolder: workspaceFolder?.replace(/\\/g, '/'),
      model,
      resolved: false
    };

    const docRef = await addDoc(collection(db, 'errorSessions'), session);
    console.log(`[Compiler Translator] Logged error session: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error('[Compiler Translator] Failed to log to Firebase:', error);
    return null;
  }
}

export async function getRecentSessions(limitCount: number = 10): Promise<ErrorSession[]> {
  if (!ensureInitialized() || !db) { return []; }

  try {
    const q = query(
      collection(db, 'errorSessions'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ErrorSession));
  } catch (error) {
    console.error('[Compiler Translator] Failed to fetch sessions:', error);
    return [];
  }
}

export function isFirebaseEnabled(): boolean {
  return initialized;
}
