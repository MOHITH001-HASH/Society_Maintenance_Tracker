import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "gen-lang-client-0615302941",
  appId: "1:859777274196:web:7afbc612822800120af8c1",
  apiKey: "AIzaSyBxjMAVZDvLqiejAAotRhtdkt4HZ92F60c",
  authDomain: "gen-lang-client-0615302941.firebaseapp.com",
  storageBucket: "gen-lang-client-0615302941.firebasestorage.app",
  messagingSenderId: "859777274196",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, "ai-studio-c3d962a9-0fd1-4205-b5d4-f7106e426007");
