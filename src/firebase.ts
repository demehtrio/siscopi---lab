/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  getFirestore
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Set persistence to local for Auth
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Error setting Auth persistence:", err);
});

// Initialize Firestore with persistent local cache for offline access and performance.
// We fallback to getFirestore if browser restrictions (like sandboxed iframes) prevent IndexedDB access.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, firebaseConfig.firestoreDatabaseId);
} catch (err) {
  console.warn("Firestore persistent local cache failed to initialize (this is expected in some sandboxed iframes). Falling back to standard/memory-cache Firestore configuration:", err);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export { db };


