import { View } from "react-native";
import { useEffect } from "react";
import { useAuth } from '@/contexts/authContext';

export default function Index() {
const { checkLoginStatus } = useAuth();

  useEffect(() => {
    checkLoginStatus();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>

    </View>
  );
}