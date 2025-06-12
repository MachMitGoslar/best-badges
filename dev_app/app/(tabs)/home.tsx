import { StyleSheet, Platform, Button, SafeAreaView, FlatList, View, Text, ScrollView } from 'react-native';
import { getAuth, signOut } from '@react-native-firebase/auth';
import { useRouter } from 'expo-router';
import { Dimensions } from 'react-native';
import { Image } from 'expo-image';

const { width } = Dimensions.get('window');
const windowWidth = width;
const gap = 12;
const itemsPerRow = 3;
const totalGap = gap * (itemsPerRow);
const itemWidth = (windowWidth - totalGap) / itemsPerRow;
const itemHeight = itemWidth*1.1;

const items = [
  {
    id: 1,
    title: 'Item 1',
    backgroundColor: 'red',
  },
  {
    id: 2,
    title: 'Item 2',
    backgroundColor: 'green',
  },
  {
    id: 3,
    title: 'Item 3',
    backgroundColor: 'blue',
  },
  {
    id: 4,
    title: 'Item 4',
    backgroundColor: 'yellow',
  }
];

export default function HomeScreen() {
  const auth = getAuth();
  const router = useRouter();
  
  

  return (
    <SafeAreaView>
      <ScrollView contentContainerStyle= {{ flexDirection: 'row', flexWrap: 'wrap', height: '100%', width: '100%'}}>
        {items.map((item) => (
          <View
            key={item.id}
            style={
              styles.singleItem
            }
          >
            <Image source={require("../../assets/badges/badge_1_1_badge.svg")} style={{ width: itemWidth-gap, height: itemHeight, alignSelf: 'center' }} />
          </View>
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
});