import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  Platform,
  NativeModules,
  TouchableOpacity
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
  IReturnStatus,
  IGpioCamera
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
  restartService,
  doPreview,
  startCapture,
  stopCapture
} from '../network/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendCameraErrorSms, sendImageCountSms } from '../network/my_sms';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconCom from 'react-native-vector-icons/MaterialCommunityIcons';
import dgram from 'react-native-udp';
import { setIp, setIps } from '../store/actions/WifiActions';
import { getStoredIps } from '../network/async_storage';

const AVERAGE_CR2_MB = 26.92;
const { NetworkScanner } = NativeModules;

const socket = dgram.createSocket('udp4');
socket.bind(12345);

export let hotspotInfo: IHotspotReturn;

let hotspotSendInfoInterval: ReturnType<typeof setInterval>;
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
    // while (!permissionState && (Platform.Version >= 29)) {
    //   permissionState = await requestRuntimePermission(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    // }
    // permissionState = false;
    // while (!permissionState && (Platform.Version >= 29)) {
    //   permissionState = await requestRuntimePermission(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
    // }
    // permissionState = false;
    // while (!permissionState && (Platform.Version >= 29)) {
    //   permissionState = await requestRuntimePermission(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    // }
  } catch (err) {
    console.warn(err);
  }
};

const renderFixedCols = (item: string | number, key: string) => {
  return (
    <View style={{ flex: 1, alignItems: 'flex-start' }} key={key}>
      <Text style={styles.textBold}>{item}</Text>
    </View>
  )
}

const renderGpioCam = (item: IGpioCamera, key: string) => {
  return (
    <View style={{ flexDirection: 'row', padding: 5, minHeight: 32, alignItems: 'center' }} key={key}>
      <View style={{ flex: 1 }}>
        <Text style={styles.textNormal}>{item.status.mode}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.textNormal}>{item.status.cams.length}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.textNormal}>{item.imageCount.imageCount}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.textNormal}>{item.status.gps ? 'Yes' : 'No'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={{ flex: 1, alignItems: 'center' }}
          disabled={!(item.status?.mode === 'STARTED' || item.status?.mode === 'STOPPED')}
          onPress={() => {
            if (item.status?.mode === 'STARTED') {
              Toast.show('Stop capturing...');
              stopCapture(item.ip)
                .then(res => {
                  const resultString = res.success ? "Stopped" : "Already stopped";
                  // Toast.show(resultString)
                })
                .catch((err) => Toast.show(err.toString()));
            } else {
              Toast.show('Start capturing...');
              startCapture(item.ip)
                .then(res => {
                  const resultString = res.success ? "Started" : "Already started";
                  // Toast.show(resultString)
                })
                .catch((err) => Toast.show(err.toString()));
            }
          }}>
          {item.status?.mode === 'STARTED' ?
            <IconCom name="camera-off" size={25} color={'black'} /> :
            <Icon name="camera-alt" size={25} color={'black'} />}
        </TouchableOpacity>
      </View>
    </View>

  )
}

const Homescreen = ({ route, navigation }: HomeProps) => {
  const dispatch = useDispatch();
  const getStatusInterval = useRef<NodeJS.Timer | null>(null);

  const ips = useSelector((state: RootState) => state.wifi.ips);

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

  const [gpioCams, setGpioCams] = useState<IGpioCamera[]>([]);

  useEffect(() => {
    setStarting(true);
    requestRuntimePermissions().then(() => {
      getStoredIps().then((storedIps) => {
        if (storedIps !== undefined && storedIps.length > 0) {
          dispatch(setIps(storedIps));
        }
      }).catch((e) => console.log(e));
      socket.on('message', function (msg: any[], rinfo: any) {
        const ip = msg.toString();
        if (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip)) {
          dispatch(setIp(ip));
        }
      })

    }).catch((err) => console.log(err));

    // dispatch(setIp('192.168.88.84'));

    return () => {
      console.log('onClose');
      if (unsubscribe) {
        unsubscribe();
      }
      stopBluetooth();
      clearInterval(getStatusInterval.current);
      clearInterval(hotspotSendInfoInterval);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (getStatusInterval.current) {
        clearInterval(getStatusInterval.current);
      }

      buildNetwork(ips).then((gpioCamsDetected) => {
        setGpioCams(gpioCamsDetected);
      }).catch((e) => console.log(e));

      getStatusInterval.current = setInterval(() => {
        buildNetwork(ips).then((gpioCamsDetected) => {
          setGpioCams(gpioCamsDetected);
        }).catch((e) => console.log(e));
      }, 2000);

      if (ips.length > 0) {
        AsyncStorage.setItem('@Tricap:ips', JSON.stringify(ips)).then(() => { }).catch(e => console.log(e));
      }

      return () => {
        console.log('stop refresh')
        clearInterval(getStatusInterval.current);
      }
    }, [ips])
  );

  useEffect(() => {
    if (gpioCams.length > 0) {
      setStarting(false);
    } else {
      setStarting(true);
    }
  }, [gpioCams.length]);

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
      clearInterval(getStatusInterval.current);
      getStatusInterval.current = setInterval(() => {
        getStatus(ip)
          .then(res => setPiStatus(res))
          .catch((e) => { });
      }, 2000);
    } catch (e) {
      console.log(e);
    }
  }

  const buildNetwork = async (ips: string[]) => {
    const newGpioCams: IGpioCamera[] = []; // make copy
    for (const ip of ips) {
      try {
        const status = await getStatus(ip);
        const imagesCaptured = await getImageCount(ip);

        newGpioCams.push({
          ip: ip,
          status: status,
          imageCount: imagesCaptured,
        });
      } catch (e) {
        newGpioCams.push({
          ip: ip,
          status: {
            mode: "OFFLINE",
            cams: [],
            camError: false,
            gps: false,
          },
          imageCount: {
            imageCount: []
          },
        });
        console.log(e);
      }
    }

    return newGpioCams;
  }

  if (starting) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.screenView}>
          <View style={{ ...styles.card, alignItems: 'center', justifyContent: 'center', }}>
            <Text style={styles.textNormal}>Detecting devices on the network...</Text>
            <ActivityIndicator size="small" color='black' />
          </View>
        </View>
        <View style={styles.screenView}>
          <View style={{ ...styles.card, alignItems: 'center', justifyContent: 'center', }}>
            <Text style={styles.textNormal}>Please ensure your hotspot is started with:</Text>
            <Text style={styles.textNormal}>SSID: ESS-ops</Text>
            <Text style={styles.textNormal}>Password: dumbo2017</Text>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.screenView}>
        {gpioCams.length === 0 ? <View></View> : (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', padding: 5 }}>
              {["Status", "Cameras", "Images", "GPS", ""].map((item, index) => (
                renderFixedCols(item, index.toString())
              ))}
            </View>
            <View style={styles.horizontalSpacer}></View>
            {gpioCams.map((item, index) => (
              renderGpioCam(item, index.toString())
            ))}
          </View>)}
        <View style={styles.horizontalSpacerThick}></View>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', width: '95%', justifyContent: 'space-evenly' }}>
            <TouchableOpacity style={{ flex: 1, alignItems: 'center' }} onPress={() => {
              Toast.show('Start capturing...');
              for (const gpioCam of gpioCams) {
                startCapture(gpioCam.ip).then(() => console.log('start req', gpioCam.ip)).catch((e) => console.log(e));
              }
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="camera-alt" size={30} color={'black'} />
                <Text style={styles.textNormal}>Start all</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, alignItems: 'center' }} onPress={() => {
              Toast.show('Stop capturing...');
              for (const gpioCam of gpioCams) {
                stopCapture(gpioCam.ip).then(() => console.log('stop req', gpioCam.ip)).catch((e) => console.log(e));
              }
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <IconCom name="camera-off" size={30} color={'black'} />
                <Text style={styles.textNormal}>Stop all</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView >
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  screenView: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 2,
    margin: 2
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
  horizontalSpacerThick: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 2,
    marginVertical: 5
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
    color: 'black',
    flexWrap: 'wrap'
  },
  textBold: {
    color: 'black',
    fontWeight: 'bold',
    flexWrap: 'wrap'
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
    padding: 4,
    width: '100%',
  },
});

export default Homescreen;