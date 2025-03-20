import '@react-native-firebase/app';
import firestore from '@react-native-firebase/firestore';
import fireauth from '@react-native-firebase/auth';
import {getApp, initializeApp, ReactNativeFirebase} from '@react-native-firebase/app';
import firebase from '@react-native-firebase/app';

import { firebaseConfig }  from '../../db_connect.js';

let app;
if (firebase.apps.length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = firebase.app()

}

if (__DEV__) {
  firestore().useEmulator('localhost', 8080);
  //fireauth().useEmulator("127.0.0.1:9099");
}


class DBService {

    public db = firestore()
    //public auth = fireauth();

    constructor() {
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