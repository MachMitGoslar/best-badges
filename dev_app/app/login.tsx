import { getAuth, onAuthStateChanged, signInWithEmailAndPassword } from "@react-native-firebase/auth";
import { useRouter, Stack } from "expo-router";
import { View } from "react-native";
import { Text, Button } from "react-native";
import { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { IconSymbol } from '@/components/ui/IconSymbol';

export default function LoginScreen() {
const router = useRouter();
const auth = getAuth();
const [ user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
const [email, setEmail] = useState<string>('');
const [password, setPassword] = useState<string>('');

  async function handleLogin() {
    console.log("Login attempt with email: " + email);
    signInWithEmailAndPassword(auth, email, password).then((userCredential) => {
      const user = userCredential.user;
      console.log("User logged in: " + user.email);
    }).catch((error) => {
      console.error("Login error: ", error);
      if (error.code ==='auth/invalid-credential') {
        Alert.alert("Invalid credentials", "Please check your email and password.");
      }
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>
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
        <TouchableOpacity onPress={() => {}}>
          <Text style={styles.forgotPassword}>Forgot Password?</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={!email || !password ? styles.buttonDisbabled : styles.button}
          onPress={handleLogin}
          disabled={!email || !password}
        >
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => {}}>
          <Text style={styles.signUp}>
            Don't have an account? <Text style={styles.signUpLink}>Sign Up</Text>
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