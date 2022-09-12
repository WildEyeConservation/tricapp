import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
// import { createDrawerNavigator } from '@react-navigation/drawer';
import { RootStackParamList } from './types';
import Icon from 'react-native-vector-icons/MaterialIcons';

import HomeScreen from '../screens/HomeScreen';
import ImagesScreen from '../screens/ImagesScreen';
import AboutScreen from '../screens/AboutScreen';
import SetupScreen from '../screens/SetupScreen';
import { HomeProps, ImagesProps, AboutProps, SetupProps } from '../navigation/types';

const HomeStack = createNativeStackNavigator<RootStackParamList>();
const ImageStack = createNativeStackNavigator<RootStackParamList>();
const AboutStack = createNativeStackNavigator<RootStackParamList>();
const SetupStack = createNativeStackNavigator<RootStackParamList>();

const HomeNav = ({ navigation }: HomeProps) => {
  return (
    <HomeStack.Navigator initialRouteName="HomeStack" screenOptions={{ headerShown: false }}>
      <HomeStack.Screen
        name="HomeStack"
        component={HomeScreen}
      />
    </HomeStack.Navigator>
  )
}

const ImageNav = ({ navigation }: ImagesProps) => {
  return (
    <ImageStack.Navigator screenOptions={{ headerShown: false }}>
      <ImageStack.Screen
        name="ImagesStack"
        component={ImagesScreen}
      />
    </ImageStack.Navigator>
  )
}

const AboutNav = ({ navigation }: AboutProps) => {
  return (
    <AboutStack.Navigator screenOptions={{ headerShown: false }}>
      <AboutStack.Screen
        name="AboutStack"
        component={AboutScreen}
      />
    </AboutStack.Navigator>
  )
}

const SetupNav = ({ navigation }: SetupProps) => {
  return (
    <SetupStack.Navigator screenOptions={{ headerShown: false }}>
      <SetupStack.Screen
        name="SetupStack"
        component={SetupScreen}
      />
    </SetupStack.Navigator>
  )
}

const Tab = createBottomTabNavigator();

const TabNav = () => {
  return (
    <Tab.Navigator>
      <Tab.Screen
        name="Home"
        component={HomeNav}
        options={{
          tabBarIcon: () => {
            return <Icon name="home" size={24} color='black' />;
          },
        }}
      />
      <Tab.Screen
        name="Images"
        component={ImageNav}
        options={{
          tabBarIcon: () => {
            return <Icon name="image" size={24} color='black' />;
          },
        }}
      />
      <Tab.Screen
        name="About"
        component={AboutNav}
        options={{
          tabBarIcon: () => {
            return <Icon name="info" size={24} color='black' />;
          },
        }}
      />
      <Tab.Screen
        name="Setup"
        component={SetupNav}
        options={{
          tabBarIcon: () => {
            return <Icon name="settings" size={24} color='black' />;
          },
        }}
      />
    </Tab.Navigator>
  );
}

export default TabNav;
