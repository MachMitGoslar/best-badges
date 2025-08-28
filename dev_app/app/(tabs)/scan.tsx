import { useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { StyleSheet, Image, Platform, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { items } from '../../model/badge'; // Assuming you have a data file with badge items

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const permissionStatus = Boolean(permission?.granted);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={scanCode}
      >
        <Text style={styles.buttonText}>Scan</Text>
      </TouchableOpacity>
    </View>
  );

  function scanCode() {
    requestPermission()
    if (!permissionStatus) {
      console.log("Camera permission not granted");
      return;
    } else {
      console.log("Camera permission granted");
      router.push('/cameraView');
    }
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
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
});
