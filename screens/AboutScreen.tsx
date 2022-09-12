import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { AboutProps } from '../navigation/types';
import DeviceInfo from 'react-native-device-info';
import { hotspotInfo } from './HomeScreen';
import { defaultHotspot } from '../network/wifi';
import { RootState } from '../store/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MyButton from '../components/MyButton';
import { sendExifSessionIds } from '../network/api';
import { IExifSessionIds } from '../network/api_types';

const renderHotspotInfo = () => {
  let ssid = defaultHotspot.SSID;
  let password = defaultHotspot.password;

  if (hotspotInfo && hotspotInfo.SSID && hotspotInfo.password) {
    ssid = hotspotInfo.SSID;
    password = hotspotInfo.password;
  }

  return (
    <View style={styles.normal}>
      <Text style={styles.textBold}>Hotspot</Text>
      <View style={styles.horizontalSpacer}></View>
      <View style={styles.aboutItems}>
        <Text style={styles.textNormal}>SSID</Text>
        <Text style={styles.textNormal}>{ssid}</Text>
      </View>
      <View style={styles.aboutItems}>
        <Text style={styles.textNormal}>Password</Text>
        <Text style={styles.textNormal}>{password}</Text>
      </View>
    </View>
  )
}

const AboutScreen = ({ route, navigation }: AboutProps) => {
  const ip = useSelector((state: RootState) => state.bt.ip);

  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    getBackgroundTasks();
  }, []);

  const getBackgroundTasks = async () => {
    const saved = await AsyncStorage.getItem('@Tricap:testTask');
    if (saved && saved !== '') {
      setTasks(JSON.parse(saved));
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.normal}>
        <Text style={styles.textBold}>General</Text>
        <View style={styles.horizontalSpacer}></View>
        <View style={styles.aboutItems}>
          <Text style={styles.textNormal}>Software version</Text>
          <Text style={styles.textNormal}>v{DeviceInfo.getReadableVersion()}</Text>
        </View>
        <View style={styles.horizontalSpacerThick}></View>
        {renderHotspotInfo()}
        {ip === '' ? <View></View> : (
          <View style={styles.aboutItems}>
            <Text style={styles.textNormal}>Raspberry pi</Text>
            <Text style={styles.textNormal}>@{ip}</Text>
          </View>
        )}
        <View style={styles.horizontalSpacerThick}></View>
        {/* <View style={{ flexDirection: 'row' }}>
          <MyButton
            title='Reload'
            onPress={getBackgroundTasks}
          ></MyButton>
          <MyButton
            title='Test'
            onPress={() => {
              const temp: IExifSessionIds = {
                sessionIds: ['123', '456']
              }
              sendExifSessionIds(temp).then(() => { }).catch(err => console.log(err));
            }}
          ></MyButton>
        </View>
        <Text style={styles.textBold}>Debug</Text>
        <View style={styles.horizontalSpacer}></View>
        {tasks.map((item, index) => (
          <Text key={index.toString()}>{item}</Text>
        ))} */}
      </View>
    </SafeAreaView >
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 5,
    paddingHorizontal: 5
  },
  normal: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutItems: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  horizontalSpacer: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 1
  },
  horizontalSpacerThick: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 2
  },
  textNormal: {
    color: 'black'
  },
  textBold: {
    color: 'black',
    fontWeight: 'bold'
  }
});

export default AboutScreen;