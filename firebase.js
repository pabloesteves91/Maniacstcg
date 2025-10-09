// Firebase v9 Modular SDK
// 1) Console: Projekt anlegen, Auth (E-Mail/Passwort) aktivieren, Firestore aktivieren
// 2) Hier DEINE Config eintragen
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, setDoc, doc,
  query, orderBy, onSnapshot, deleteDoc, getDoc   // <-- getDoc HINZU!
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-functions.js";

// === Firebase Config (ersetzen) ===
const firebaseConfig = {
  apiKey: "AIzaSyAOHpWMsHOk5Ls67WlljqK_h0vsgmi0jgg",
  authDomain: "maniacstcg-bbc37.firebaseapp.com",
  projectId: "maniacstcg-bbc37",
  storageBucket: "maniacstcg-bbc37.appspot.com",
  messagingSenderId: "762124601481",
  appId: "1:762124601481:web:fc6eeb6bea98971d6d1e58",
  measurementId: "G-L50D657EYP"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Falls du in EU deployst (europe-west1), kannst du Region setzen:
// export const fns = getFunctions(app, "europe-west1");
export const fns = getFunctions(app);

// Auth-Wrapper
export const loginEmail = (email, pass)=>signInWithEmailAndPassword(auth, email, pass);
export const logout     = ()=>signOut(auth);
export const onUser     = (cb)=>onAuthStateChanged(auth, cb);

// Cloud Functions (optional; nur nötig, wenn du sie verwendest)
export const cfCreateUser = httpsCallable(fns, 'createManiacUser');
export const cfSetUserRole = httpsCallable(fns, 'setManiacRole');

// Firestore Helpers
export const col    = (name)=>collection(db, name);
export const docRef = (name, id)=>doc(db, name, id);

// Re-exports (inkl. getDoc!)
export { addDoc, getDocs, setDoc, onSnapshot, query, orderBy, deleteDoc, getDoc }; // <-- getDoc HINZU!
