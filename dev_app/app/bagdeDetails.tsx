import { StyleSheet, Platform, Button, SafeAreaView, FlatList, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { getAuth, signOut } from '@react-native-firebase/auth';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Dimensions } from 'react-native';
import { Image } from 'expo-image';



export default function BadgeDetails() {
  const auth = getAuth();
  const router = useRouter();

  const { id, title, granted,condition, description } = useLocalSearchParams<{
    id: string;
    title: string;
    granted: string;
    condition: string;
    description: string;
  }>();

  return (
    <SafeAreaView>
      <Stack.Screen options={{ headerTitle: title, headerBackTitle: 'Zurück' }} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 10 }}>{title}</Text>
        <Text style={{ fontSize: 16, color: 'gray', marginBottom: 20 }}>{granted !== undefined ? description : condition}</Text>
        <Text style={{ fontSize: 18, marginBottom: 10 }}>Status:</Text>
        <Text style={{ fontSize: 16, color: granted !== undefined ? 'green' : 'red' }}>
          {granted !== undefined ? 'Erhalten' : 'Nicht erhalten'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}