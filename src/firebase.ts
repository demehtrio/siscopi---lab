/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Set persistence to local for Auth
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Error setting Auth persistence:", err);
});

// Initialize Firestore using standard getFirestore, which automatically
// handles the best caching strategy depending on the environment (memory/IndexedDB)
// and works seamlessly in sandboxed preview iframes.
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Test connection on boot as requested by Firebase skill guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.toLowerCase().includes('offline'))) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();


