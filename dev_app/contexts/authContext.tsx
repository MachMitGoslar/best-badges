import React, { createContext, useContext, useState } from 'react';
import { createUserWithEmailAndPassword, FirebaseAuthTypes, getAuth, onAuthStateChanged, signInWithEmailAndPassword } from '@react-native-firebase/auth';
import { useRouter } from 'expo-router';
import { doc, getFirestore, setDoc } from '@react-native-firebase/firestore/lib/modular';
import { Alert } from 'react-native';

// Types
interface AuthContextType {
    activeUser: FirebaseAuthTypes.User | null;
    checkLoginStatus: () => void;
    signInUser: (email: string, password: string) => Promise<void>;
    signOutUser: () => Promise<void>;
    signUpUser: (email: string, password: string) => Promise<void>;
}

interface AuthProviderProps {
    children: React.ReactNode;
}

// This context provides the authentication of the user
// authState, signIn, signUp, signOut
export const AuthContext = createContext<AuthContextType | null>(null);

function AuthProvider({ children }: AuthProviderProps) {
    const db = getFirestore();
    const auth = getAuth();
    const router = useRouter();
    const [activeUser, setActiveUser] = useState<FirebaseAuthTypes.User | null>(null);

    // Check the user's login status (subscribed to auth state changes)
    // and set the active user as a global state
    async function checkLoginStatus() {
        try {
            onAuthStateChanged(auth, (user: FirebaseAuthTypes.User) => {
                if (user) {
                    setActiveUser(user);
                    console.log('Actual User: ' + user.email);
                    console.log('User ID: ' + user.uid);
                    router.replace('./(tabs)/home');
                } else {
                    console.log('No user is logged in.');
                    setActiveUser(null);
                    router.replace('/login');
                }
            });
        } catch (error) {
            console.error('Error checking auth state: ', error);
        }
    }

    // Sign in user with email and password and
    // set the last login timestamp in user document
    async function signInUser(email: string, password: string) {
        try {
            console.log('Login attempt with email: ' + email);

            signInWithEmailAndPassword(auth, email, password).then((userCredential) => {
                const user = userCredential.user;
                console.log('User logged in: ' + user.uid);

                setDoc(doc(db, 'users', user.uid), {
                    email: user.email,
                    lastLogin: new Date(),
                });

                return user.uid as string;
            });
        } catch (error: any) {
            console.error('Login error: ', error);
            if (error.code === 'auth/invalid-credential') {
                Alert.alert('Invalid credentials', 'Please check your email and password.');
            }
        }
    }

    // Sign out user and clear the active user from global state
    // and navigate back to login screen
    async function signOutUser() {
        try {
            await auth.signOut();
            setActiveUser(null);
            router.replace('/login');
        } catch (error: any) {
            console.error('Sign out error: ', error);
        }
    }

    // Sign up user with email and password
    async function signUpUser(email: string, password: string) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log('User signed up: ' + user.uid);

        } catch (error: any) {
            console.error('Sign up error: ', error);
        }
    }

    return <AuthContext.Provider value={{ activeUser, checkLoginStatus, signInUser, signOutUser, signUpUser }}>{children}</AuthContext.Provider>;
}

function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export { AuthProvider, useAuth };
