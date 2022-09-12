import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Switch
} from 'react-native';
import { SetupProps } from '../navigation/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-simple-toast';
import MyButton from '../components/MyButton';
import { sendSms } from '../network/my_sms';
import { wifiSetup } from '../store/actions/BtActions';
import { RootState } from '../store/types';
import { wait } from '../utils/general';
import Icon from 'react-native-vector-icons/MaterialIcons';

export let phoneNr = '';
let hotspotSsid = '';
let hotspotPassword = '';

let wifiSetupBusy = false;

AsyncStorage.getItem('@Tricap:phoneNr')
  .then((res) => {
    if (res) {
      phoneNr = res;
    }
    console.log(phoneNr);
  })
  .catch((err) => {
    console.log(err);
  });

AsyncStorage.getItem('@Tricap:hotspotSsid')
  .then((res) => {
    if (res) {
      hotspotSsid = res;
    }
    console.log(hotspotSsid);
  })
  .catch((err) => {
    console.log(err);
  });

AsyncStorage.getItem('@Tricap:hotspotPassword')
  .then((res) => {
    if (res) {
      hotspotPassword = res;
    }
    console.log(hotspotPassword);
  })
  .catch((err) => {
    console.log(err);
  });

const SetupScreen = ({ route, navigation }: SetupProps) => {
  const [newPhoneNr, setNewPhoneNr] = useState(phoneNr);
  const [newSsid, setNewSsid] = useState(hotspotSsid);
  const [newPassword, setNewPassword] = useState(hotspotPassword);
  const [validPhoneNr, setValidPhoneNr] = useState(phoneNr !== '');
  const [validHotspot, setValidHotspot] = useState(hotspotPassword !== '' && hotspotSsid !== '');
  const [updatingHotspot, setUpdatingHotspot] = useState(false);
  const [useManualHotspotEnabled, setUseManualHotspotEnable] = useState(false);
  const [secureText, setSecureText] = useState(true);

  const dispatch = useDispatch();
  const isConnected = useSelector((state: RootState) => state.bt.connected);
  const wifiDone = useSelector((state: RootState) => state.bt.wifiDone);

  useEffect(() => {
    AsyncStorage.getItem('@Tricap:useHotspot')
      .then((res) => {
        if (res === 'software' || res === '' || res === null) {
          setUseManualHotspotEnable(false);
        } else {
          setUseManualHotspotEnable(true);
        }
        console.log(res);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);

  useEffect(() => {
    console.log('wifiDone', updatingHotspot, wifiSetupBusy);
    if (updatingHotspot && wifiSetupBusy) {
      setUpdatingHotspot(false);
      wifiSetupBusy = false;
      if (useManualHotspotEnabled) {
        Toast.show('Close the application and manually start your hotspot.', Toast.LONG);
      }
    }
  }, [wifiDone]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={{ width: '100%', alignItems: 'flex-start', justifyContent: 'flex-start', padding: 5 }}>
        <View style={styles.normal}>
          <Text style={styles.textBold}>SMS</Text>
        </View>
        <View style={styles.horizontalSpacer}></View>
        <View style={styles.row}>
          <Text style={styles.textNormal}>Phone number:</Text>
          <TextInput
            style={styles.input}
            value={newPhoneNr}
            onChangeText={setNewPhoneNr}
            onEndEditing={() => {
              console.log('phoneNr', phoneNr, newPhoneNr);
              const phoneNrRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/im;
              if (phoneNrRegex.test(newPhoneNr) || newPhoneNr === '') {
                AsyncStorage.setItem('@Tricap:phoneNr', newPhoneNr).then(() => { }).catch(e => console.log(e));
                phoneNr = newPhoneNr;
                setValidPhoneNr(true);
              } else {
                console.log('Invalid phone number');
                Toast.show('Invalid phone number', Toast.SHORT);
              }
            }}
          ></TextInput>
        </View>
        <View style={{ alignItems: 'center', width: '100%', padding: 5 }}>
          <MyButton
            title='Test SMS'
            disabled={!validPhoneNr}
            onPress={() => {
              Toast.show('Testing SMS...');
              sendSms('Test SMS');
            }}
          ></MyButton>
        </View>
        <View style={styles.horizontalSpacerThick}></View>
        <View style={styles.normal}>
          <Text style={styles.textBold}>Hotspot</Text>
        </View>
        <View style={styles.horizontalSpacer}></View>
        <Text style={{ ...styles.textNormal, opacity: 0.8 }}>Note: For the best user experience, enter your own hotspot information here and manually start a hotspot from the Android OS settings.</Text>
        <View style={styles.row}>
          <Text style={styles.textNormal}>SSID:</Text>
          <TextInput
            style={styles.input}
            value={newSsid}
            onChangeText={setNewSsid}
            onEndEditing={() => {
              AsyncStorage.setItem('@Tricap:hotspotSsid', newSsid).then(() => { }).catch(e => console.log(e));
              hotspotSsid = newSsid;
              setValidHotspot(hotspotSsid !== '' && hotspotPassword !== '');
            }}
          ></TextInput>
        </View>
        <View style={styles.row}>
          <Text style={styles.textNormal}>Password:</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              style={styles.input}
              value={newPassword}
              secureTextEntry={secureText}
              onChangeText={setNewPassword}
              onEndEditing={() => {
                AsyncStorage.setItem('@Tricap:hotspotPassword', newPassword).then(() => { }).catch(e => console.log(e));
                hotspotPassword = newPassword;
                setValidHotspot(hotspotSsid !== '' && hotspotPassword !== '');
              }}
            ></TextInput>
            <Icon style={{ paddingHorizontal: 5 }} color='black' onPress={() => setSecureText(setSecureText => !setSecureText)} name="remove-red-eye" size={20} />
          </View>
        </View>
        <View style={{ alignItems: 'center', width: '100%', padding: 5 }}>
          {updatingHotspot ? (
            <ActivityIndicator size="small" color='black' />
          ) : (
            <MyButton
              title='Save hotspot'
              disabled={!validHotspot}
              onPress={() => {
                if (isConnected) {
                  Toast.show('Saving hotspot...');
                  wifiSetupBusy = true;
                  dispatch(wifiSetup(hotspotSsid, hotspotPassword));
                  setUpdatingHotspot(true);
                  wait(4000).then(() => setUpdatingHotspot(false)).catch(e => console.log(e));
                } else {
                  Toast.show('Bluetooth not connected');
                }
              }}
            ></MyButton>
          )}
        </View>
        <View style={styles.row}>
          <Text style={styles.textNormal}>Use this hotspot:</Text>
          <Switch
            onValueChange={(value) => {
              setUseManualHotspotEnable(value);
              if (value) {
                AsyncStorage.setItem('@Tricap:useHotspot', 'manual').then(() => { }).catch(e => console.log(e));
              } else {
                AsyncStorage.setItem('@Tricap:useHotspot', 'software').then(() => { }).catch(e => console.log(e));
              }
            }}
            value={useManualHotspotEnabled}
          />
        </View>
        <View style={styles.horizontalSpacerThick}></View>
        <View style={{ alignItems: 'center', width: '100%', padding: 5 }}>
          <MyButton
            title='Clear data'
            onPress={() => {
              AsyncStorage.clear().then(() => Toast.show('Data cleared')).catch((err) => console.log(err));
            }}
          ></MyButton>
        </View>
      </View>
    </SafeAreaView >
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  normal: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  input: {
    marginHorizontal: 10,
    borderBottomWidth: 1,
  },
  horizontalSpacer: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 1,
  },
  horizontalSpacerThick: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 2
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%'
  },
  textNormal: {
    color: 'black'
  },
  textBold: {
    color: 'black',
    fontWeight: 'bold'
  }
});

export default SetupScreen;