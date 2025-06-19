import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, Stack, useRouter } from 'expo-router';
import { StyleSheet, Image, Platform, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';

export default function Scan() {
  const {back} = useRouter();

  return (
    
    <View style={styles.container}>
      <Stack.Screen options={{ headerTitle: "Scannen", headerBackTitle: 'Zurück' }} />
      <CameraView 
        style={styles.camera} 
        facing="back"
        onBarcodeScanned={(barcode) => {
          console.log('Barcode scanned:', barcode);
          /* Acitvate Badge */
          router.dismissTo('/(tabs)/home');
        }}
        >
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    margin: 64,
  },
  button: {
    flex: 1,
    alignSelf: 'flex-end',
    alignItems: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
});