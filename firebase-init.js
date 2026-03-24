import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-analytics.js";

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

const app = initializeApp(firebaseConfig);

// Analytics is not supported in every environment (e.g., some local setups).
isSupported().then((ok) => {
  if (ok) getAnalytics(app);
}).catch(() => {
  // Keep app running even if analytics init fails.
});

window.firebaseApp = app;
