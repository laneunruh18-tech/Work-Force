// Firebase setup for Work Force

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


// 🔥 YOUR CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyA625hMlrshAM6c5Om1TXy7m8KFOTzvZ7U",
  authDomain: "workforce-4e9c8.firebaseapp.com",
  projectId: "workforce-4e9c8",
  storageBucket: "workforce-4e9c8.firebasestorage.app",
  messagingSenderId: "211971019008",
  appId: "1:211971019008:web:bb7265ef1d5f164a1323e5",
  measurementId: "G-2N18S3M685"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

// Shared collection
export const callsCollection = collection(db, "calls");

// Firestore helpers
export {
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
};
