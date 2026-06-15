import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const isQuota = errMessage.toLowerCase().includes('quota') || errMessage.toLowerCase().includes('resource-exhausted') || errMessage.toLowerCase().includes('limit exceeded');
  
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  if (isQuota) {
    if (typeof window !== 'undefined') {
      (window as any).__firestore_quota_exceeded__ = true;
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
    }
    console.warn('Firestore Quota Exceeded (handled gracefully with offline cache fallback):', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }

  throw new Error(JSON.stringify(errInfo));
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isStaff: false,
} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          let fetchedProfile: UserProfile | null = null;
          if (userDoc.exists()) {
            fetchedProfile = userDoc.data() as UserProfile;
          } else {
            // Auto-create profile for first-time login
            const isDefaultAdmin = firebaseUser.email === 'lucas@lemcontabilidade.com';
            const emailPrefix = firebaseUser.email ? firebaseUser.email.split('@')[0] : '';
            // Capitalize email prefix for a cleaner name display
            const fallbackName = emailPrefix 
              ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1).replace(/[._-]/g, ' ')
              : 'Colaborador';

            const newProfile: UserProfile = {
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || fallbackName,
              nome: firebaseUser.displayName || fallbackName,
              role: isDefaultAdmin ? 'admin' : 'analista',
              status: 'active',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, newProfile);
            fetchedProfile = newProfile;

            // Initialize system settings if they don't exist (only for the first admin)
            if (isDefaultAdmin) {
              const settingsDocRef = doc(db, 'settings', 'system');
              const settingsDoc = await getDoc(settingsDocRef);
              if (!settingsDoc.exists()) {
                const currentYear = new Date().getFullYear();
                const years = Array.from({ length: 7 }, (_, i) => currentYear - i);
                await setDoc(settingsDocRef, {
                  currentExercise: currentYear,
                  defaultDeadlineDays: 7,
                  backupEnabled: true,
                  notificationsEnabled: true,
                  availableYears: years
                });
              }
            }
          }

          if (fetchedProfile) {
            localStorage.setItem(`user_profile_${firebaseUser.uid}`, JSON.stringify(fetchedProfile));
            setProfile(fetchedProfile);
          }
        } catch (error) {
          const errMessage = error instanceof Error ? error.message : String(error);
          const isQuota = errMessage.toLowerCase().includes('quota') || errMessage.toLowerCase().includes('resource-exhausted') || errMessage.toLowerCase().includes('limit exceeded');
          if (isQuota) {
            if (typeof window !== 'undefined') {
              (window as any).__firestore_quota_exceeded__ = true;
              window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
            }
            console.warn('Firebase Quota limit exceeded when fetching/creating user profile, using fallback caches.');
          } else {
            console.error('Error fetching/creating user profile:', error);
          }
          // Fallback: load from localStorage
          const cached = localStorage.getItem(`user_profile_${firebaseUser.uid}`);
          if (cached) {
            try {
              const cachedProfile = JSON.parse(cached);
              setProfile(cachedProfile);
              console.log('Loaded user profile from local storage fallback due to network/quota error.');
            } catch (_) {
              // Ignore parsing errors
            }
          } else {
            // Create transient in-memory local profile so the UI doesn't crash or get stuck on loading
            const isDefaultAdmin = firebaseUser.email === 'lucas@lemcontabilidade.com';
            const localProfile: UserProfile = {
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
              role: isDefaultAdmin ? 'admin' : 'analista',
              status: 'active',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            setProfile(localProfile);
            console.log('Created transient in-memory user profile fallback due to lack of local cache and firestore error.');
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isStaff: !!profile && ['admin', 'gestor', 'analista'].includes(profile.role),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
