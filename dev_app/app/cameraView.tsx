import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, Stack, useRouter } from 'expo-router';
import { StyleSheet, Image, Platform, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { getFirestore, doc, setDoc, arrayUnion, Timestamp, collection } from '@react-native-firebase/firestore'
import { getAuth } from '@react-native-firebase/auth';

export default function Scan() {
  const {back} = useRouter();
  const db = getFirestore();
  const user = getAuth().currentUser;

  return (
    
    <View style={styles.container}>
      <Stack.Screen options={{ headerTitle: "Scannen", headerBackTitle: 'Zurück' }} />
      <CameraView 
        style={styles.camera} 
        facing="back"
        onBarcodeScanned={(barcode) => {
          console.log('Barcode scanned:', barcode.data.substring(15,37));
          /* Activate Badge */
          let item = barcode.data.substring(15,37);
            if (user) {
            let badge = doc(db, 'users', user.uid).collection('badges').where('id', '==', item).get().then((querySnapshot) => {
              if (querySnapshot.empty) {
                console.log('Badge not found, creating new badge entry');
                setDoc(doc(db, 'users', user.uid), {
                  badges: arrayUnion({
                    id: item,
                    granted: Timestamp.now(),
                  }),
                }, { merge: true });
              } else {
                console.log('Badge already exists, skipping creation');
              }
            });
            console.log('Badge:', badge);
            // setDoc(doc(db, 'users', user.uid), {
            //         badges: arrayUnion({
            //           id: item,
            //           granted: Timestamp.now(),
            //         }),
            //       }, { merge: true });
            }
            console.log('Badge activated:', item);
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