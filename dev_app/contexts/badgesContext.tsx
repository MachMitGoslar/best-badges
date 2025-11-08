import React, { createContext, useContext, useEffect, useState } from 'react';
import { getAuth } from '@react-native-firebase/auth';
import { collection, getFirestore } from '@react-native-firebase/firestore/lib/modular';
import { badge } from '@/model/badge';
import { userBadge } from '@/model/userbadge';

// Types
interface BadgesContextType {
    fetchBadges: () => Promise<void>;
    grantedItems: Array<userBadge>;
}

interface BadgesProviderProps {
    children: React.ReactNode;
}

// This context provides the management of badges within the app
// fetchGlobalBadges, fetchUserBadges, checkGrantedBadges
export const BadgesContext = createContext<BadgesContextType | null>(null);

function BadgesProvider({ children }: BadgesProviderProps) {
    const db = getFirestore();
    const auth = getAuth();
    const badgesRef = collection(db, 'badges');
    const userRef = collection(db, 'users/' + auth.currentUser?.uid + '/badges');
    const [globalItems, setGlobalItems] = useState<Array<badge>>([]);
    const [userItems, setUserItems] = useState<Array<userBadge>>([]);
    const [grantedItems, setGrantedItems] = useState<Array<userBadge>>([]);

    // Fetch badges from Firestore
    async function fetchBadges() {
        let globalBadges: badge[] = [];
        let userBadges: userBadge[] = [];

        badgesRef.onSnapshot((querySnapshot) => {
            querySnapshot.forEach((doc) => {
                console.log('Globale Badges: ' + doc.id);
                const id = doc.id;
                const { title, granted, condition, description } = doc.data();
                globalBadges.push({ id, title, granted, condition, description });
                setGlobalItems(globalBadges);
            });
        });

        userRef.onSnapshot((querySnapshot) => {
            querySnapshot.forEach((doc) => {
                console.log('User Badges: ' + doc.id);
                const id = doc.id;
                const { title, granted, condition, description } = doc.data();
                userBadges.push({ id, title, granted, condition, description });
                setUserItems(userBadges);
            });
        });
    }

    // Check and mark granted badges
    async function checkGrantedBadges() {
        const grantedBadges = globalItems.map((globalBadge) => {
            const matchingUserBadge = userItems.find((userBadge) => userBadge.id === globalBadge.id);

            if (matchingUserBadge) {
                return {
                    ...globalBadge,
                    granted: matchingUserBadge.granted,
                };
            } else {
                return globalBadge;
            }
        });
        console.log('Granted Badges Check: ', grantedBadges);
        setGrantedItems(grantedBadges);
    }

    // Re-check granted badges when globalItems or userItems change
    useEffect(() => {
        checkGrantedBadges();
    }, [globalItems, userItems]);

    return <BadgesContext.Provider value={{ grantedItems, fetchBadges }}>{children}</BadgesContext.Provider>;
}

function useBadges(): BadgesContextType {
    const context = useContext(BadgesContext);
    if (!context) {
        throw new Error('useBadges must be used within a BadgesProvider');
    }
    return context;
}

export { BadgesProvider, useBadges };
