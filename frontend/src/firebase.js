import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Replace with your actual Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyCH7v78zYJ9l339_LEIDGqC6Z3BvWVi_Ew",
    authDomain: "ingrelyze-a0478.firebaseapp.com",
    projectId: "ingrelyze-a0478",
    storageBucket: "ingrelyze-a0478.firebasestorage.app",
    messagingSenderId: "353091861714",
    appId: "1:353091861714:web:d8a99b37c2925895fcc10b"
};

// Initialize Firebase
console.log("Initializing Firebase with config:", firebaseConfig);
const app = initializeApp(firebaseConfig);
console.log("Firebase App Initialized:", app);
export const auth = getAuth(app);
export const db = getFirestore(app);
