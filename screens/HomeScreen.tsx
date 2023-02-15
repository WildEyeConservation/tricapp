import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  PermissionsAndroid,
  Permission,
  Image,
  Dimensions,
  Platform
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { HomeProps } from '../navigation/types';
import Toast from 'react-native-simple-toast';
import { wait, timeAsHHMM } from '../utils/general';

import { connect, wifiSetup, getIpAddress, stopBluetooth } from '../store/actions/BtActions';
import { RootState } from '../store/types';
import { doHotspot, IHotspotReturn } from '../network/wifi';
import {
  ICamera,
  IExternal,
  IStats,
  IStatus,
  ICopyEta,
  IRestart
} from '../network/api_types';
import MyButton from '../components/MyButton';
import {
  unsubscribe,
  getStatus,
  getStats,
  getCopyEta,
  getImageCount,
  syncExif,
  getLensNumber,
  restartService
} from '../network/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendCameraErrorSms, sendImageCountSms } from '../network/my_sms';

const AVERAGE_CR2_MB = 26.92;

export let hotspotInfo: IHotspotReturn;

let hotspotSendInfoInterval: ReturnType<typeof setInterval>;
let getStatusInterval: ReturnType<typeof setInterval>;
let getIpTimeout: ReturnType<typeof setTimeout>;

let wifiSetupBusy = false;

const requestRuntimePermission = async (permission: Permission) => {
  try {
    const granted = await PermissionsAndroid.request(
      permission,
      {
        title: "TricApp Permission",
        message: "Please allow permission",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK"
      }
    );
    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
      console.log("Permission granted", permission);
      return true;
    } else {
      console.log("Permission denied", permission);
    }
  } catch (err) {
    console.warn(err);
  }
  return false;
};

const requestRuntimePermissions = async () => {
  let permissionState = false;
  try {
    while (!permissionState && (Platform.Version >= 29)) {
      permissionState = await requestRuntimePermission(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    }
    permissionState = false;
    while (!permissionState && (Platform.Version >= 29)) {
      permissionState = await requestRuntimePermission(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
    }
    permissionState = false;
    while (!permissionState && (Platform.Version >= 29)) {
      permissionState = await requestRuntimePermission(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
  } catch (err) {
    console.warn(err);
  }
};

const renderFixedCols = (item: string | number, key: string) => {
  return (
    <View style={{ flex: 1, alignItems: 'center' }} key={key}>
      <Text style={styles.textNormal}>{item}</Text>
    </View>
  )
}

const Homescreen = ({ route, navigation }: HomeProps) => {
  const dispatch = useDispatch();

  const isEnabled = useSelector((state: RootState) => state.bt.enabled);
  const isConnected = useSelector((state: RootState) => state.bt.connected);
  const ip = useSelector((state: RootState) => state.bt.ip);
  const noResponse = useSelector((state: RootState) => state.bt.noResponse);
  const wifiDone = useSelector((state: RootState) => state.bt.wifiDone);

  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(true);
  const [btConnecting, setBtConnecting] = useState(true);

  const [camStats, setCamStats] = useState<ICamera[]>();
  const [externalStats, setExternalStats] = useState<IExternal>();
  const [batteryStats, setBatteryStats] = useState(0);
  const [piStatus, setPiStatus] = useState<IStatus>();
  const [cameraTime, setCameraTime] = useState('0 s');
  const [externalTime, setExternalTime] = useState('0 s');
  const [totalTime, setTotalTime] = useState('0 s');
  const [samplePeriodS, setSamplePeriodS] = useState(0);
  const [lensNumber, setLensNumber] = useState('');

  useEffect(() => {
    requestRuntimePermissions().then(() => {
      dispatch(connect());
      Toast.show('Setting up connection...', Toast.SHORT);
      doHotspot().then(res => {
        hotspotInfo = res;
      })
        .catch(e => console.log(e));
      wait(500).then(() => { setStarting(false) });
      wait(15000).then(() => { setBtConnecting(false) });
    }).catch((err) => console.log(err));

    return () => {
      console.log('onClose');
      if (unsubscribe) {
        unsubscribe();
      }
      stopBluetooth();
      clearInterval(getStatusInterval);
      clearInterval(hotspotSendInfoInterval);
    }
  }, []);

  // useEffect(() => {
  //   if (!btConnecting && !isConnected) {
  //     // BT connection failed -> pi not connected -> sync exif from local storage
  //     syncExif(ip)
  //       .then(() => Toast.show('Sync successful'))
  //       .catch((err) => Toast.show(err));
  //   }
  // }, [btConnecting, isConnected]);

  useEffect(() => {
    if (isEnabled && isConnected) {
      console.log('Bluetooth connected');
      setBtConnecting(false);
      if (ip === '') {
        Toast.show('Bluetooth connected. Waiting for IP address...', Toast.LONG);
        if (hotspotInfo && hotspotInfo.SSID && hotspotInfo.password) {
          // pi needs to get SSID and password
          wifiSetupBusy = true;
          dispatch(wifiSetup(hotspotInfo.SSID, hotspotInfo.password));
        } else if (hotspotInfo) {
          // pi will connect to fixed ssid and password
          dispatch(getIpAddress());
        } else {
          // No hotspot info -> wait for hotspot info and send over BT
          clearInterval(hotspotSendInfoInterval);
          hotspotSendInfoInterval = setInterval(() => {
            if (hotspotInfo) {
              clearInterval(hotspotSendInfoInterval);
              if (hotspotInfo.SSID && hotspotInfo.password) {
                wifiSetupBusy = true;
                dispatch(wifiSetup(hotspotInfo.SSID, hotspotInfo.password));
              } else {
                dispatch(getIpAddress());
              }
            }
          }, 1000);
        }
      }
    }
  }, [isConnected, isEnabled, hotspotInfo]);

  useEffect(() => {
    if (ip === "") {
      return;
    }
    Toast.show(`Device on ${ip}`, Toast.SHORT);
    setBtConnecting(false);
    getData(ip);
    AsyncStorage.setItem('@Tricap:ip', ip).then(() => { }).catch(e => console.log(e));
  }, [ip]);

  useEffect(() => {
    console.log('wifiDone', wifiSetupBusy);
    if (wifiSetupBusy) {
      wifiSetupBusy = false;
      Toast.show('Wi-Fi configured. Waiting for the device\'s IP address...', Toast.LONG);
      clearTimeout(getIpTimeout);
      getIpTimeout = setTimeout(() => {
        // allow time for multiple responses to come back
        dispatch(getIpAddress());
      }, 5000);
    }
  }, [wifiDone]);

  useEffect(() => {
    if (piStatus?.camError) {
      sendCameraErrorSms(piStatus);
    }
  }, [piStatus?.camError]);

  const calculateTimeLeft = (info: IStats) => {
    // calculate camera min time
    const minFreeMB = Math.min.apply(Math, info.cameras.map((o) => o.freeMB));
    const camFreeS = minFreeMB / AVERAGE_CR2_MB * info.captureInterval;
    try {
      setCameraTime(timeAsHHMM(camFreeS));
    } catch (e) {
      setCameraTime(timeAsHHMM(0));
    }

    // calculate external min time
    const numCameras = info.cameras.length > 0 ? info.cameras.length : 3;
    const extFreeS = info.external.freeGB * 1024 / AVERAGE_CR2_MB / numCameras * info.captureInterval;
    try {
      setExternalTime(timeAsHHMM(extFreeS));
    } catch (e) {
      setExternalTime(timeAsHHMM(0));
    }

    // calculate minimum total time
    try {
      if (extFreeS < camFreeS) {
        setTotalTime(timeAsHHMM(extFreeS));
      } else {
        setTotalTime(timeAsHHMM(camFreeS));
      }
    } catch (e) {
      setTotalTime(timeAsHHMM(0));
    }
  }

  const getData = async (ip: string) => {
    // use async await here to allow mount / unmount of external on pi
    try {
      Toast.show('Synching...');
      await getStats(ip)
        .then((res) => {
          setCamStats(res.cameras);
          setExternalStats(res.external);
          setBatteryStats(res.battery);
          setSamplePeriodS(res.captureInterval);
          calculateTimeLeft(res);
        })
        .catch((e) => Toast.show(e.toString(), Toast.LONG));
      await getStatus(ip)
        .then(res => setPiStatus(res))
        .catch((e) => Toast.show(e.toString(), Toast.LONG));
      await syncExif(ip)
        .then((res) => Toast.show(res))
        .catch((e) => Toast.show(e.toString(), Toast.LONG));
      setRefreshing(false);
      clearInterval(getStatusInterval);
      getStatusInterval = setInterval(() => {
        getStatus(ip)
          .then(res => setPiStatus(res))
          .catch((e) => { });
      }, 2000);
    } catch (e) {
      console.log(e);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    getData(ip);
    wait(5000).then(() => setRefreshing(false));
  }, [ip]);

  if (starting) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.normal}>
          <ActivityIndicator size="small" color='black' />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={{ ...styles.textBold, fontSize: 24, paddingTop: 5 }}>{piStatus?.mode}</Text>
      {(!isEnabled || !isConnected) && !btConnecting && ip === '' ? (
        <View style={styles.connectionStatus}>
          <Text style={{ color: 'black', padding: 2, fontWeight: 'bold' }}>Bluetooth not connected</Text>
        </View>
      ) : (<View></View>)}
      {isConnected && noResponse ? (
        <View style={styles.connectionStatus}>
          <Text style={{ color: 'black', padding: 2, fontWeight: 'bold' }}>Bluetooth not responding</Text>
        </View>
      ) : (<View></View>)}
      {piStatus && piStatus.progress && piStatus.mode === 'STARTED' ? (
        <View style={styles.copyStatus}>
          <Text style={styles.textNormal}>Progress: {piStatus.progress.copied.map((item, index) => <Text key={index.toString()}>[{item}]</Text>)} / {piStatus.progress.captured.map((item, index) => <Text key={index.toString()}>[{item}]</Text>)}</Text>
          {piStatus.progress.percentage === 1 ?
            <Text style={styles.textNormal}>Deleting...</Text> :
            <Text style={styles.textNormal}>Time remaining: {piStatus.progress.timeRemaining} ({(piStatus.progress.percentage * 100).toFixed(0)}%) {piStatus.progress.exceptions?.filter(item => item > 0).length > 0 ? `Copy exceptions: ${piStatus.progress.exceptions.reduce((a, b) => a + b)}` : ''}</Text>}
        </View>
      ) : <View></View>}
      {piStatus && piStatus.camError && piStatus.cams ? (
        <View style={styles.connectionStatus}>
          <View style={{ flexDirection: 'row' }}>
            {piStatus.cams.map((item, index) => (
              renderFixedCols(item, index.toString())
            ))}
          </View>
        </View>
      ) : <View></View>}
      {ip === '' && (isConnected || btConnecting) ? (
        <View style={styles.normal}>
          <Text style={styles.textNormal}>This may take a few seconds</Text>
          <ActivityIndicator size="small" color='black' />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.screenView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh} />
          }
          scrollEnabled={false}>
          <View style={styles.estimation}>
            <Text style={styles.textBold}>Cameras</Text>
            <Text style={styles.textBold}>Approx. {cameraTime} left</Text>
          </View>
          <View style={styles.horizontalSpacerThick}></View>
          <View style={{ flexDirection: 'row' }}>
            {['SN', 'Used [GB]', 'Free [GB]', 'Capacity [GB]'].map((item, index) => (
              renderFixedCols(item, index.toString())
            ))}
          </View>
          <View style={styles.horizontalSpacer}></View>
          {camStats === undefined ? <View></View> : (
            camStats.map((cam, index) => (
              <View style={{ flexDirection: 'row' }} key={index.toString()}>
                {[cam.id, cam.usedGB, cam.freeGB, cam.capacityGB].map((item, index) => (
                  renderFixedCols(item, index.toString())
                ))}
              </View>
            ))
          )}
          <View style={{ height: 10 }}></View>
          <View style={styles.estimation}>
            <Text style={styles.textBold}>External storage</Text>
            <Text style={styles.textBold}>Approx. {externalTime} left</Text>
          </View>
          <View style={styles.horizontalSpacerThick}></View>
          <View style={{ flexDirection: 'row' }}>
            {['Used [GB]', 'Free [GB]', 'Capacity [GB]'].map((item, index) => (
              renderFixedCols(item, index.toString())
            ))}
          </View>
          <View style={styles.horizontalSpacer}></View>
          {externalStats === undefined ? <View></View> : (
            <View style={{ flexDirection: 'row' }}>
              {[externalStats.usedGB, externalStats.freeGB, externalStats.capacityGB].map((item, index) => (
                renderFixedCols(item, index.toString())
              ))}
            </View>
          )}
          <View style={{ height: 10 }}></View>
          <View style={styles.estimation}>
            <Text style={styles.textBold}>Total</Text>
            <Text style={styles.textBold}>Approx. {totalTime} left</Text>
          </View>
          <View style={styles.horizontalSpacerThick}></View>
          <View style={{ height: 10 }}></View>
          <View style={styles.estimation}>
            <Text style={styles.textBold}>GPS status</Text>
            <Text style={styles.textBold}>{piStatus?.gps ? "Connected" : "Not connected"}</Text>
          </View>
          {/* <View style={{ height: 10 }}></View>
            <View style={styles.estimation}>
              <Text style={styles.textBold}>Battery</Text>
              <Text style={styles.textBold}>{batteryStats.toFixed(0)}%</Text>
            </View>
            <View style={styles.horizontalSpacerThick}></View> */}
          {/* <View style={{ height: 10 }}></View>
            <View style={styles.estimation}>
              <Text style={styles.textBold}>Capture interval</Text>
              <Text style={styles.textBold}>{samplePeriodS}s</Text>
            </View>
            <View style={styles.horizontalSpacerThick}></View> */}
          <View style={styles.horizontalSpacerThick}></View>
          <View style={{ paddingTop: 10 }}>
            <Image source={require('../assets/RigSetup.png')} style={{ resizeMode: 'contain', width: Dimensions.get('window').width * 0.95, height: Dimensions.get('window').height / 2.5 }} />
          </View>
        </ScrollView>
      )
      }
    </SafeAreaView >
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  screenView: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 2
  },
  connectionStatus: {
    width: '100%',
    backgroundColor: 'crimson',
    alignItems: 'center',
  },
  copyStatus: {
    width: '100%',
    backgroundColor: 'cyan',
    alignItems: 'center',
  },
  normal: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  horizontalSpacerThick: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 2
  },
  horizontalSpacer: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 1
  },
  estimation: {
    width: '95%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  testButtons: {
    width: '95%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around'
  },
  textNormal: {
    color: 'black'
  },
  textBold: {
    color: 'black',
    fontWeight: 'bold'
  }
});

export default Homescreen;