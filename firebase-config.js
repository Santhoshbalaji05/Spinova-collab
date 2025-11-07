// Firebase Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD2DC35dx24mvvaf-Y8yMZKNssF8ixhZmg",
  authDomain: "spinovacollab.firebaseapp.com",
  projectId: "spinovacollab",
  storageBucket: "spinovacollab.firebasestorage.app",
  messagingSenderId: "694794722859",
  appId: "1:694794722859:web:9f7147a59a2c673312946e"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };