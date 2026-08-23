import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User as FirebaseUser, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { User } from "../types";

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  isAnonymous?: boolean;
}

interface AuthContextType {
  user: AppUser | FirebaseUser | null;
  userProfile: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = async () => {
    localStorage.removeItem("society_session_uid");
    localStorage.removeItem("society_session_email");
    localStorage.removeItem("society_session_name");
    setUser(null);
    setUserProfile(null);
    try {
      await firebaseSignOut(auth);
    } catch {
      // Ignored if not signed in with Firebase Auth
    }
  };

  useEffect(() => {
    let unsubProfile = () => {};

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        localStorage.removeItem("society_session_uid");
        setUser(currentUser);
        const docRef = doc(db, "users", currentUser.uid);
        unsubProfile = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserProfile({ id: docSnap.id, ...docSnap.data() } as User);
          } else {
            setUserProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("Error fetching user profile:", error);
          setUserProfile(null);
          setLoading(false);
        });
      } else {
        // Check for active fallback session (e.g. OTP or Demo mode)
        const sessionUid = localStorage.getItem("society_session_uid");
        if (sessionUid) {
          const simulatedUser: AppUser = {
            uid: sessionUid,
            email: localStorage.getItem("society_session_email") || `${sessionUid}@society.internal`,
            displayName: localStorage.getItem("society_session_name") || "Resident",
            isAnonymous: true,
          };
          setUser(simulatedUser);
          const docRef = doc(db, "users", sessionUid);
          unsubProfile = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
              setUserProfile({ id: docSnap.id, ...docSnap.data() } as User);
            } else {
              setUserProfile(null);
            }
            setLoading(false);
          }, () => {
            setUserProfile(null);
            setLoading(false);
          });
        } else {
          setUser(null);
          setUserProfile(null);
          setLoading(false);
          unsubProfile();
        }
      }
    });

    return () => {
      unsubscribe();
      unsubProfile();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

