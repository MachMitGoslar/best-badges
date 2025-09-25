import { StyleSheet, Platform, Button, SafeAreaView, FlatList, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { getAuth, signOut } from '@react-native-firebase/auth';
import { collection, getFirestore, Timestamp } from '@react-native-firebase/firestore';
import { useNavigation, useRouter } from 'expo-router';
import { Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { badge } from '../../model/badge'; // Assuming you have a data file with badge items

import firestore, { query } from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

const { width } = Dimensions.get('window');
const windowWidth = width;
const gap = 12;
const itemsPerRow = 4;
const totalGap = gap * (itemsPerRow);
const itemWidth = (windowWidth - totalGap) / itemsPerRow;
const itemHeight = itemWidth*1.1;


export default function HomeScreen() {
  const auth = getAuth();
  const router = useRouter();
  const firestore = getFirestore();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Array<badge>>([]);
  const [userItems, setUserItems] = useState<Array<Date>>([]);

  // Auslesen Bagdes aus Firestore
  const badgesRef = collection(firestore, 'badges');
  // Auslesen der Badges des aktuellen Users
  const userRef = collection(firestore, 'users/' + auth.currentUser?.uid + '/badges');
  
  useEffect(() => {
    let docs: Array<badge> =  [];
    const fetch =  async () => badgesRef.onSnapshot(querySnapshot => {
      querySnapshot.forEach(doc => {
        console.log('Globale Badges: ' + doc.id);
        const id = doc.id;
        const { title, granted, condition, description } = doc.data();
        docs.push({ id, title, granted, condition, description });
        setItems(docs);
      });
    });

    const userFetch = async () => userRef.onSnapshot(querySnapshot => {
      let userDocs = [];
      querySnapshot.forEach(doc => {
        console.log('User Badges: ' + doc.id);
        const granted: Timestamp = doc.data().granted;
        console.log(granted.toDate());
        userDocs.push(granted.toDate());
        setUserItems(userDocs);
      });
    });

    fetch().then(() => {
      userFetch();

      setLoading(false);
    });
    console.log(items);
  }, []);

  return (
    <SafeAreaView>
      <ScrollView contentContainerStyle= {{ flexDirection: 'row', flexWrap: 'wrap', height: '100%', width: '100%'}}>
        {items.map((item) => (
          <TouchableOpacity onPress={() => {
            console.log('Item pressed:', item.id)
            router.push({ pathname: "/bagdeDetails", params: { id: item.id, title: item.title, granted: item.granted, condition: item.condition, description: item.description } });
          }} key={item.id} style={
            styles.singleItem
          }>
              <Image source={require("../../assets/badges/badge_1_1_badge.svg")} style={item.granted != undefined ? styles.badgeGranted : styles.badgeToReach} />
              <Text style={styles.badgesTitle}>{item.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  itemsWrap: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: -(gap / 2),
    marginHorizontal: -(gap / 2),
  },
  singleItem: {
    marginHorizontal: gap / 2,
    marginVertical: gap / 2,
    minWidth: itemWidth,
    maxWidth: itemWidth,
    minHeight: itemHeight,
    maxHeight: itemHeight,
  },
  badgeGranted: {
    width: itemWidth - gap,
    height: itemHeight,
    alignSelf: 'center',
  },
  badgeToReach: {
    opacity: 0.4,
    width: itemWidth - gap,
    height: itemHeight,
    alignSelf: 'center',
  },
  badgesTitle: {
    textAlign: 'center',
  }
});