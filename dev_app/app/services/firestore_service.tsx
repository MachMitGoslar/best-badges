import firestore, { connectFirestoreEmulator, FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import {FirebaseAuthTypes, getAuth, connectAuthEmulator} from '@react-native-firebase/auth';
import {getApp, initializeApp, getApps, ReactNativeFirebase } from '@react-native-firebase/app';

import { firebaseConfig }  from '../../db_connect.js';



class DBService {
    public app: ReactNativeFirebase.FirebaseApp;
    public db: FirebaseFirestoreTypes.Module
    public auth: FirebaseAuthTypes.Module;

    constructor() {
      if (getApps().length === 0) {
        this.app = initializeApp(firebaseConfig);
      } else {
        this.app = getApp()
      
      }
      
      this.db = firestore(this.app);
      this.auth = getAuth(this.app);

      if (__DEV__) {
      
       connectAuthEmulator(this.auth, "localhost:9099");
       connectFirestoreEmulator(this.db, "localhost", 8080);
        
      }

    
    }

    public saveToDB() {
        this.db.collection("badges").add({
            title: "test",
            when: new Date()
        })

        //this.auth.signInWithEmailAndPassword("test", "käsebrot")
    }

}

const singleton = new DBService();
export default singleton;