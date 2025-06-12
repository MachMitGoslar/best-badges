import { StyleSheet, Platform, Button, SafeAreaView, FlatList, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { getAuth, signOut } from '@react-native-firebase/auth';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Dimensions } from 'react-native';
import { Image } from 'expo-image';



export default function BadgeDetails() {
  const auth = getAuth();
  const router = useRouter();

  const { id, title, granted, description } = useLocalSearchParams<{
    id: string;
    title: string;
    granted: string;
    description: string;
  }>();

  return (
    <SafeAreaView>
      <Stack.Screen options={{ headerTitle: title, headerBackTitle: 'Zurück' }} />
    </SafeAreaView>
  );
}