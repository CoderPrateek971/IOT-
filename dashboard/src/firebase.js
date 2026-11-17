// Member 3 owns Firebase configuration, authentication, reads, writes, and subscriptions.
// Other members define their telemetry/action fields and coordinate the shared data schema here.
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getDatabase, limitToLast, onValue, push, query, ref, set } from 'firebase/database';

const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);
const app = isFirebaseConfigured ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null;
const auth = app ? getAuth(app) : null;
const database = app ? getDatabase(app) : null;

export async function ensureFirebaseUser() {
  if (!auth) throw new Error('Firebase is not configured. Add the VITE_FIREBASE values to dashboard/.env.local.');
  const currentUser = auth.currentUser || await new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    }, reject);
  });
  if (currentUser) return currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}

export async function saveTelemetry(uid, telemetry) {
  if (!database || !uid) return;
  const capturedAt = Date.now();
  const record = { ...telemetry, capturedAt };
  const historyRef = push(ref(database, `users/${uid}/telemetry`));
  await Promise.all([
    set(ref(database, `users/${uid}/latestTelemetry`), record),
    set(historyRef, record)
  ]);
}

export async function saveActionResult(uid, action) {
  if (!database || !uid) return;
  const record = { ...action, createdAt: action.createdAt || Date.now() };
  await set(push(ref(database, `users/${uid}/actions`)), record);
}

export function subscribeToActionHistory(uid, onHistory, onError) {
  if (!database || !uid) return () => {};
  const recentActions = query(ref(database, `users/${uid}/actions`), limitToLast(30));
  return onValue(recentActions, (snapshot) => {
    const values = Object.values(snapshot.val() || {});
    values.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    onHistory(values);
  }, onError);
}
