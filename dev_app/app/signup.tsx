import { router } from "expo-router";
import { View } from "react-native";
import { Text } from "react-native";
import { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { IconSymbol } from '@/components/ui/IconSymbol';
import { getFirestore } from "@react-native-firebase/firestore";
import { useAuth } from '@/contexts/authContext';

export default function LoginScreen() {
const db = getFirestore();
const { signUpUser } = useAuth();
const [email, setEmail] = useState<string>('');
const [password, setPassword] = useState<string>('');
const [passwordConfirmation, setPasswordConfirmation] = useState<string>('');

  async function handleSignUp() {
      const userId = await signUpUser(email, password);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign Up</Text>
        <View style={styles.inputContainer}>
          <IconSymbol size={25} name="envelope.fill" style={styles.icon} color={"grey"} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              keyboardType="email-address"
              onChangeText={(e) => setEmail(e.toLowerCase())}
              value={email}
            />
        </View>
        <View style={styles.inputContainer}>
          <IconSymbol size={25} name="key.fill" style={styles.icon} color={"grey"} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              secureTextEntry
              onChangeText={(e) => setPassword(e)}
              value={password}
            />
        </View>
        <View style={styles.inputContainer}>
          <IconSymbol size={25} name="key.fill" style={styles.icon} color={"grey"} />
            <TextInput
            style={styles.input}
            placeholder="Password Confirmation"
            secureTextEntry
            onChangeText={(e) => setPasswordConfirmation(e)}
            value={passwordConfirmation}
            />
        </View>
        <TouchableOpacity
          style={!email || !password || password !== passwordConfirmation ? styles.buttonDisbabled : styles.button}
          onPress={handleSignUp}
          disabled={!email || !password || password !== passwordConfirmation}
        >
          <Text style={styles.buttonText}>Sign Up</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => {router.replace('/login')}}>
          <Text style={styles.signUp}>
            Back to <Text style={styles.signUpLink}>Login</Text>
          </Text>
        </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  logo: {
    height: 200,
    width: 200,
    resizeMode: 'contain',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    marginBottom: 40,
    fontWeight: 'bold',
    color: 'black',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 50,
    backgroundColor: '#f1f1f1',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: '100%',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    color: '#000',
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#1E90FF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisbabled: {
    width: '100%',
    height: 50,
    backgroundColor: '#BEBEBE',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
  },
  signUp: {
    color: '#000',
  },
  signUpLink: {
    color: '#1E90FF',
  },
  errorText: {
    color: 'red',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
});