import { Image, StyleSheet, Platform, Button, Alert, GestureResponderEvent } from 'react-native';
import { IconSymbol } from '@/components/ui/IconSymbol';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { getAuth, createUserWithEmailAndPassword, connectAuthEmulator } from '@react-native-firebase/auth';

export default function HomeScreen() {
  const auth = getAuth();

  return (
    <ParallaxScrollView
          headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
          headerImage={
            <IconSymbol
              size={310}
              color="#808080"
              name="chevron.left.forwardslash.chevron.right"
            />
          }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome!</ThemedText>
        <Button title='Test2' color="orange" onPress={log} />
      </ThemedView>
    </ParallaxScrollView>
  );

  async function log() {
    console.log('Button pressed');
    await createUserWithEmailAndPassword(auth, "test@test.com", "password").then(
      (userCredential) => {
        // Signed in
        const user = userCredential.user;
        console.log(user);
      }
    ).catch((error) => {
      const errorCode = error.code;
      const errorMessage = error.message;
      console.log(errorCode, errorMessage);
    }
    );
  }
}
const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
