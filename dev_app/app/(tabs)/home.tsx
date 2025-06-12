import { StyleSheet, Platform, Button, SafeAreaView, FlatList, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { getAuth, signOut } from '@react-native-firebase/auth';
import { useNavigation, useRouter } from 'expo-router';
import { Dimensions } from 'react-native';
import { Image } from 'expo-image';

const { width } = Dimensions.get('window');
const windowWidth = width;
const gap = 12;
const itemsPerRow = 4;
const totalGap = gap * (itemsPerRow);
const itemWidth = (windowWidth - totalGap) / itemsPerRow;
const itemHeight = itemWidth*1.1;

const items = [
  {
    id: 1,
    title: 'Altstadtlauf 2025',
    granted: '04.05.2025',
    description: 'Teilnahme am Altstadtlauf 2025. Gratulation!',
  },
  {
    id: 2,
    title: 'Tim\'s Kaffeejunkie',
    granted: '',
    description: 'Du hast einen Kaffe bei Tims\'s gekauft.'
  },
  {
    id: 3,
    title: 'Mit!Macher',
    granted: '',
    description: 'Du hast dich beim Mach!Mit-Haus über das Angebot informiert.',
  },
];

export default function HomeScreen() {
  const auth = getAuth();
  const router = useRouter();
  
  

  return (
    <SafeAreaView>
      <ScrollView contentContainerStyle= {{ flexDirection: 'row', flexWrap: 'wrap', height: '100%', width: '100%'}}>
        {items.map((item) => (
          <TouchableOpacity onPress={() => {
            console.log('Item pressed:', item.id)
            router.push({ pathname: "/bagdeDetails", params: { id: item.id, title: item.title, granted: item.granted, description: item.description } });
          }} key={item.id} style={
            styles.singleItem
          }>
              <Image source={require("../../assets/badges/badge_1_1_badge.svg")} style={item.granted != '' ? styles.badgeGranted : styles.badgeToReach} />
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