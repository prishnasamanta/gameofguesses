import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-analytics.js";
// ADDED: Import Database modules
import { getDatabase, ref, set, onValue, update, push } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC6E5x9tZLYDsPLvS2VlRt772iHtxEVzUs",
  authDomain: "goguesses.firebaseapp.com",
  databaseURL: "https://goguesses-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "goguesses",
  storageBucket: "goguesses.firebasestorage.app",
  messagingSenderId: "830221967737",
  appId: "1:830221967737:web:42d95a3e0f697ccb840fa8",
  measurementId: "G-2Z8JMCP9YC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app); // Initialize the Database

// Analytics check
isSupported().then((ok) => {
  if (ok) getAnalytics(app);
});

// EXPOSE TO GLOBAL WINDOW 
// This allows your main game script to use 'db' and 'rtdb' commands easily
window.firebaseApp = app;
window.db = db;
window.rtdb = { ref, set, onValue, update, push };

console.log("🔥 Firebase Initialized & Database Ready!");
