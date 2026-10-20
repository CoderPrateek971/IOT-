import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

// Replace with your Firebase Project Configuration
// You can get this from Firebase Console -> Project Settings -> General -> Web App
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

let db = null;
export let isFirebaseReady = false;

try {
  if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    isFirebaseReady = true;
    console.log("Firebase connected successfully");
  }
} catch (error) {
  console.warn("Firebase not configured yet. Running in local simulation mode.", error);
}

export { db, ref, set, onValue };
