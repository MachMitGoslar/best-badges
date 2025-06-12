import { getAuth, onAuthStateChanged, signInWithEmailAndPassword } from "@react-native-firebase/auth";
import { useRouter, Stack } from "expo-router";
import { View } from "react-native";
import { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { useEffect, useState } from "react";

export default function Index() {
const router = useRouter();
const auth = getAuth();
const [ user, setUser] = useState<FirebaseAuthTypes.User | null>(null);

  async function checkLoginStatus() {
    try {
      onAuthStateChanged(auth, (user: FirebaseAuthTypes.User) => {
        if (user) {
          setUser(user);
          console.log("Actual User: " + user.email);
          router.replace("./(tabs)/home");
        } else {
          console.log("No user is logged in.");
          setUser(null);
          router.replace("/login");
        }
      });
    } catch (error) {}
  }

  useEffect(() => {
    checkLoginStatus();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>

    </View>
  );
}