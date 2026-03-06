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
  TouchableOpacity,
  AppState
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {
  startGpsWatch,
  stopGpsWatch,
  startGpsLogging,
  stopGpsLogging,
  setPositionReceivedCallback,
} from '../network/gps_logger';
import { GpsStatusContext, CaptureStatusContext } from '../navigation/AppNavigations';
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
  IGpioCamera,
  IGpioCameraSettings
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
import { formatSeconds } from '../components/Utils'
import { theme } from '../theme';

interface ISelectIp {
  (ip: string): void;
}

interface ISelectIndex {
  (idx: number): void;
}

interface ISelectDevice {
  (dev: IGpioCamera): void;
}

const AVERAGE_CR2_MB = 26.92;
const AVERAGE_ARW_MB = 74;
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
  try {
    await requestRuntimePermission(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  } catch (err) {
    console.warn(err);
  }
};

const renderFixedCols = (item: string | number, key: string, flex: number = 1) => {
  return (
    <View style={{ flex: flex, alignItems: 'center' }} key={key}>
      <Text style={styles.textBold}>{item}</Text>
    </View>
  )
}

const renderGpioCam = (item: IGpioCamera, key: string, flex: number[], selectDevice: ISelectDevice) => {
  return (
    <View style={{ flexDirection: 'row', padding: 5, minHeight: 32, alignItems: 'center' }} key={key}>
      <View style={{ flex: flex[0], alignItems: 'center' }}>
        <Text style={styles.textNormal}>{item.status.mode}</Text>
      </View>
      <View style={{ flex: flex[1], alignItems: 'center' }}>
        <Text style={styles.textNormal}>{item.imageCount.imageCount.length > 1 ? JSON.stringify(item.imageCount.imageCount) : item.imageCount.imageCount}</Text>
      </View>
      <View style={{ flex: flex[2], alignItems: 'center' }}>
        <Text style={styles.textNormal}>{item.imageCount.copyCount.length > 1 ? JSON.stringify(item.imageCount.copyCount) : item.imageCount.copyCount}</Text>
      </View>
      <View style={{ flex: flex[3], alignItems: 'center' }}>
        <TouchableOpacity style={{ flex: 1, alignItems: 'center' }}
          disabled={!(item.status?.mode === 'STARTED' || item.status?.mode === 'STOPPED')}
          onPress={() => {
            selectDevice(item);
          }}>
          {item.status?.mode === 'STARTED' ?
            <IconCom name="camera-off" size={25} color={'black'} /> :
            item.status?.mode === 'STOPPED' ?
            <Icon name="camera-alt" size={25} color={'black'} /> :
            <Icon name="error" size={22} color={theme.error} />}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const renderSettings = (item: IGpioCamera, key: string, flex: number[], selectDevice: ISelectIndex, selectedIdx: number, refreshDevice: ISelectIp) => {
  const isSelected = key === selectedIdx.toString();
  return (
    <TouchableOpacity style={{ flexDirection: 'row', padding: 5, alignItems: 'center' }} key={key} onPress={() => {
      console.log('select', item.ip);
      selectDevice(parseInt(key));
    }}>
      <View style={{ flex: flex[0], alignItems: 'center' }}>
        <Text style={isSelected ? styles.textBold : styles.textNormal}>{item.ip}</Text>
      </View>
      <View style={{ flex: flex[1], alignItems: 'center' }}>
        <Text style={isSelected ? styles.textBold : styles.textNormal}>{item.status.cams.length}</Text>
      </View>
      <View style={{ flex: flex[2], alignItems: 'center' }}>
        <Text style={isSelected ? styles.textBold : styles.textNormal}>{item.status.gps.fix ? 'Yes' : 'No'}</Text>
      </View>
      <TouchableOpacity style={{ flex: flex[3], alignItems: 'center' }} onPress={() => {
        console.log('do refresh');
        refreshDevice(item.ip);
      }}>
        <Icon name="refresh" size={25} color={'black'} />
      </TouchableOpacity>
    </TouchableOpacity >
  )
}

const renderStorage = (description: string, item: IExternal) => {
  return (
    <View style={{ flexDirection: 'row', padding: 5, minHeight: 32, alignItems: 'center', justifyContent: 'space-evenly' }}>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={styles.textNormal}>{description}</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={styles.textNormal}>{item.freeGB ? item.freeGB : 0}GB</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={styles.textNormal}>{item.usedGB ? item.usedGB : 0}GB</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={styles.textNormal}>{item.capacityGB ? item.capacityGB : 0}GB</Text>
      </View>
    </View >
  )
}

const renderCams = (item: ICamera, key: string) => {
  return (
    <View style={{ flexDirection: 'row', padding: 5, minHeight: 32, alignItems: 'center' }} key={key}>
      <View style={{ flex: 1 }}>
        <Text style={styles.textNormal}>{item.freeGB}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.textNormal}>{item.usedGB}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.textNormal}>{item.capacityGB}</Text>
      </View>
    </View >
  )
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; }, [value]);
  return ref;
}

const Homescreen = ({ route, navigation }: HomeProps) => {
  const dispatch = useDispatch();
  const getStatusInterval = useRef<NodeJS.Timer | null>(null);
  const updateExpectedCaptureInterval = useRef<NodeJS.Timer | null>(null);

  const ips = useSelector((state: RootState) => state.wifi.ips);

  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(true);
  const [btConnecting, setBtConnecting] = useState(true);

  const [camStats, setCamStats] = useState<ICamera[]>();
  const [internalStats, setInternalStats] = useState<IExternal>();
  const [externalStats, setExternalStats] = useState<IExternal>();
  const [batteryStats, setBatteryStats] = useState(0);
  const [piStatus, setPiStatus] = useState<IStatus>();
  const [cameraTime, setCameraTime] = useState('0 s');
  const [externalTime, setExternalTime] = useState('0 s');
  const [totalTime, setTotalTime] = useState('0 s');
  const [samplePeriodS, setSamplePeriodS] = useState(0);
  const [lensNumber, setLensNumber] = useState('');
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const { isError, setIsError, isCapturing, setIsCapturing } = React.useContext(CaptureStatusContext);
  const [stopRequested, setStopRequested] = useState<boolean>(false);
  const [postProcessingDots, setPostProcessingDots] = useState(0);
  const [postProcessingSeconds, setPostProcessingSeconds] = useState(0);

  const [gpioCams, setGpioCams] = useState<IGpioCamera[]>([]);
  const [prevGpioCams, setPrevGpioCams] = useState<IGpioCamera[] | null>(null);

  // always points to the newest count
  const gpioCamsRef = useLatest(gpioCams);
  const prevGpioCamsRef = useLatest(prevGpioCams);

  const captureSessionStart = useRef<Date | null>(null);
  const fixTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { setHasFix, setIsLogging } = React.useContext(GpsStatusContext);

  useEffect(() => {
    if (!stopRequested) {
      setPostProcessingDots(0);
      setPostProcessingSeconds(0);
      return;
    }
    const id = setInterval(() => {
      setPostProcessingDots((n) => (n + 1) % 4);
      setPostProcessingSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [stopRequested]);

  useEffect(() => {
    setStarting(true);

    const startGps = async () => {
      let permitted = false;
      if (Platform.OS === 'ios') {
        const result = await Geolocation.requestAuthorization('whenInUse');
        permitted = result === 'granted';
      } else {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'TricApp Location',
            message: 'Location access is needed to show GPS status and log positions during capture.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        permitted = result === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (!permitted) {
        console.warn('GPS: location permission denied');
        return;
      }
      setPositionReceivedCallback(() => {
        setHasFix(true);
        if (fixTimeoutRef.current) clearTimeout(fixTimeoutRef.current);
        fixTimeoutRef.current = setTimeout(() => setHasFix(false), 2500);
      });
      startGpsWatch();
    };

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
      });
    }).catch((err) => console.log(err));

    startGps().catch((e) => console.warn('GPS watch start failed', e));

    let current = AppState.currentState;

    const subscription = AppState.addEventListener('change', (next) => {
      // background -> active means your app is visible again
      if (current.match(/inactive|background/) && next === 'active') {
        console.log('App resumed / back to foreground');
        setPrevGpioCams(null);
      }
      current = next;
    });

    return () => {
      console.log('onClose');
      if (unsubscribe) {
        unsubscribe();
      }
      stopBluetooth();
      clearInterval(getStatusInterval.current);
      clearInterval(hotspotSendInfoInterval);
      clearInterval(updateExpectedCaptureInterval.current);
      subscription.remove();
      stopGpsLogging();
      stopGpsWatch();
      if (fixTimeoutRef.current) clearTimeout(fixTimeoutRef.current);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Reset possible error condition when entering Home (same as app resume)
      setPrevGpioCams(null);

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
      }, 3000);

      if (ips.length > 0) {
        AsyncStorage.setItem('@Tricap:ips', JSON.stringify(ips)).then(() => { }).catch(e => console.log(e));
      }

      return () => {
        console.log('stop refresh')
        clearInterval(getStatusInterval.current);
        setIsCapturing(false);
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

  useEffect(() => {
    console.log('isCapturing changed', isCapturing)
    if (isCapturing) {
      if (updateExpectedCaptureInterval.current) {
        clearInterval(updateExpectedCaptureInterval.current);
      }

      updateExpectedCaptureInterval.current = setInterval(() => {
        console.log('updateExpectedCaptureInterval')
        if (prevGpioCamsRef && prevGpioCamsRef.current) {
          for (let i = 0; i < gpioCamsRef.current.length; i++) {
            if (gpioCamsRef.current[i].status.mode === 'STARTED') {
              for (let j = 0; j < gpioCamsRef.current[i].imageCount.imageCount.length; j++) {
                const currentCount = gpioCamsRef.current[i].imageCount.imageCount[j];
                const currentCopyCount = gpioCamsRef.current[i].imageCount.copyCount[j];
                if ((prevGpioCamsRef.current.length > i) && (prevGpioCamsRef.current[i].imageCount.imageCount.length > j)) {
                  const prevCount = prevGpioCamsRef.current[i].imageCount.imageCount[j];
                  const prevCopyCount = prevGpioCamsRef.current[i].imageCount.copyCount[j];
                  console.log('count', prevCount, currentCount, 'copy', prevCopyCount, currentCopyCount);
                  if ((currentCount <= prevCount) || (currentCopyCount <= prevCopyCount)) {
                    setIsError(true);
                    break;
                  }
                }
              }
            }
          }
        }

        setPrevGpioCams(gpioCamsRef.current);
      }, 10000); // this time must be greater than the capture interval
    } else {
      setIsError(false);
      setStopRequested(false);
      if (updateExpectedCaptureInterval.current) {
        clearInterval(updateExpectedCaptureInterval.current);
      }
    }
  }, [isCapturing]);

  useEffect(() => {
    if (isCapturing) {
      captureSessionStart.current = new Date();
      const run = async () => {
        if (Platform.OS === 'android') {
          const hasBackground = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
          );
          if (!hasBackground) {
            const result = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
              {
                title: 'TricApp background location',
                message:
                  'Allow location access all the time so GPS can be logged to file when the app is in the background during capture.',
                buttonNeutral: 'Ask Me Later',
                buttonNegative: 'Cancel',
                buttonPositive: 'OK',
              }
            );
            if (result !== PermissionsAndroid.RESULTS.GRANTED) {
              Toast.show('Background location is needed for GPS logging when app is not in focus.', Toast.LONG);
            }
          }
        }
        try {
          await startGpsLogging(captureSessionStart.current!);
          setIsLogging(true);
        } catch (e) {
          console.warn('GPS logging start failed', e);
        }
      };
      run();
    } else {
      stopGpsLogging();
      setIsLogging(false);
      captureSessionStart.current = null;
    }
  }, [isCapturing]);

  const getData = async (ip: string) => {
    // use async await here to allow mount / unmount of external on pi
    try {
      // Toast.show('Synching...');
      Toast.show('Updating...');
      await getStats(ip)
        .then((res) => {
          console.log('getStats', res);
          // setCamStats(res.cameras);
          setInternalStats(res.internalStorage);
          setExternalStats(res.externalStorage);
          // setBatteryStats(res.battery);
          setSamplePeriodS(res.captureInterval);
          // calculateTimeLeft(res);
        })
        .catch((e) => {
          Toast.show(e.toString(), Toast.LONG)
          setInternalStats({
            freeGB: 0,
            capacityGB: 0,
            usedGB: 0,
          });
          setExternalStats({
            freeGB: 0,
            capacityGB: 0,
            usedGB: 0,
          });
          setSamplePeriodS(0);
          // calculateTimeLeft(res);
        });
      // await getStatus(ip)
      //   .then(res => setPiStatus(res))
      //   .catch((e) => Toast.show(e.toString(), Toast.LONG));
      // await syncExif(ip)
      //   .then((res) => Toast.show(res))
      //   .catch((e) => Toast.show(e.toString(), Toast.LONG));
      setRefreshing(false);
      // clearInterval(getStatusInterval.current);
      // getStatusInterval.current = setInterval(() => {
      //   getStatus(ip)
      //     .then(res => setPiStatus(res))
      //     .catch((e) => { });
      // }, 2000);
    } catch (e) {
      console.log(e);
    }
  }

  const buildNetwork = async (ips: string[]) => {
    let isAnyCapturing = false;
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

        if (status.mode === 'STARTED') {
          isAnyCapturing = true;
        }
      } catch (e) {
        newGpioCams.push({
          ip: ip,
          status: {
            mode: "OFFLINE",
            cams: [],
            camError: false,
            gps: {
              fix: false,
              satellites: 0,
              pdop: 0,
              max: 0,
              min: 0,
              avg: 0,
              lastUpdate: 0,
            },
            wifiSignal: 0
          },
          imageCount: {
            imageCount: [],
            copyCount: []
          },
        });
        console.log(e);
      }
    }

    setIsCapturing(isAnyCapturing);
    return newGpioCams;
  }

  if (starting) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.startingContent}>
          <View style={{ ...styles.card, alignItems: 'center', justifyContent: 'center', }}>
            <Text style={styles.textNormal}>Detecting devices on the network...</Text>
            <ActivityIndicator size="small" color='black' />
          </View>
          <View style={styles.horizontalSpacerWithMargin}></View>
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
      <ScrollView
        style={styles.screenView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {gpioCams.length > 0 && isError && !stopRequested && <View style={styles.errorCard}>
          <TouchableOpacity onPress={() => { setIsError(false) }}>
            <Text style={styles.textBold}>Something went wrong! Dismiss?</Text>
          </TouchableOpacity>
        </View>}
        {gpioCams.length > 0 && isError && !stopRequested && <View style={styles.horizontalSpacerWithMargin}></View>}
        {gpioCams.length > 0 && stopRequested && <View style={{ ...styles.card, alignItems: 'center' }}>
          <Text style={styles.textBold}>Post processing{'.'.repeat(postProcessingDots)} ({postProcessingSeconds}s)</Text>
        </View>}
        {gpioCams.length > 0 && stopRequested && <View style={styles.horizontalSpacerWithMargin}></View>}
        {gpioCams.length === 0 ? <View></View> : (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', padding: 5 }}>
              {["Status", "Captured", "Copied", ""].map((item, index) => (
                renderFixedCols(item, index.toString(), [3, 5, 5, 1][index])
              ))}
            </View>
            <View style={styles.horizontalSpacer}></View>
            {gpioCams.map((item, index) => (
              renderGpioCam(item, index.toString(), [3, 5, 5, 1], (dev) => {
                if (dev.status?.mode === 'STARTED') {
                  Toast.show('Stop capturing...');
                  setStopRequested(true);
                  stopCapture(dev.ip)
                    .then(res => {
                      const resultString = res.success ? "Stopped" : "Already stopped";
                      // Toast.show(resultString)
                    })
                    .catch((err) => Toast.show(err.toString()));
                } else if (dev.status?.mode === 'STOPPED') {
                  Toast.show('Start capturing...');
                  setIsError(false);
                  setStopRequested(false);
                  setPrevGpioCams(null);
                  startCapture(dev.ip)
                    .then(res => {
                      const resultString = res.success ? "Started" : "Already started";
                      // Toast.show(resultString)
                    })
                    .catch((err) => Toast.show(err.toString()));
                }
              })
            ))}
          </View>)}
        <View style={styles.horizontalSpacerWithMargin}></View>
        {selectedIdx < gpioCams.length && <View style={styles.card}>
          <View style={{ flexDirection: 'row', padding: 5 }}>
            {["Device", "Cameras", "GPS", ""].map((item, index) => (
              renderFixedCols(item, index.toString(), [5, 3, 3, 1][index])
            ))}
          </View>
          <View style={styles.horizontalSpacer}></View>
          {gpioCams.map((item, index: number) => (
            renderSettings(item, index.toString(), [5, 3, 3, 1],
              (idx) => {
                setSelectedIdx(idx);
                getData(gpioCams[idx].ip).then(() => { }).catch((e) => console.log(e));
              },
              selectedIdx,
              (ip) => {
                getData(ip).then(() => { }).catch((e) => console.log(e));
              },)
          ))}
        </View>}
        {(externalStats || internalStats) && <View style={styles.horizontalSpacerWithMargin}></View>}
        {(externalStats || internalStats) && selectedIdx < gpioCams.length && <View style={styles.card}>
          <View style={{ flexDirection: 'row', padding: 5 }}>
            {["", "Free", "Used", "Capacity"].map((item, index) => (
              renderFixedCols(item, index.toString())
            ))}
          </View>
          <View style={styles.horizontalSpacer}></View>
          {internalStats && renderStorage("Internal", internalStats)}
          {externalStats && renderStorage("External", externalStats)}
          {internalStats && gpioCams[selectedIdx].status.cams.length > 0 && samplePeriodS > 0 &&
            <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
              <Text style={styles.textNormal}>Estimated flight time:</Text>
              <Text style={styles.textNormal}>{
                formatSeconds(internalStats.freeGB *
                  1024 *
                  samplePeriodS /
                  AVERAGE_ARW_MB /
                  gpioCams[selectedIdx].status.cams.length)
              }</Text>
            </View>}
        </View>}
      </ScrollView>
      <View style={[
        styles.startStopCardContainer,
        isCapturing && !isError && { backgroundColor: theme.primary, borderRadius: 12, overflow: 'hidden' },
        isCapturing && isError && !stopRequested && { backgroundColor: theme.error, borderRadius: 12, overflow: 'hidden' },
      ]}>
        <View style={[
          styles.startStopCard,
          isCapturing && !isError && { backgroundColor: theme.primary },
          isCapturing && isError && !stopRequested && { backgroundColor: theme.error },
          isCapturing && { justifyContent: 'center' },
        ]}>
          {isCapturing ? (
            <TouchableOpacity style={styles.startStopButton} onPress={() => {
              Toast.show('Stop capturing...');
              setStopRequested(true);
              for (const gpioCam of gpioCams) {
                stopCapture(gpioCam.ip).then(() => console.log('stop req', gpioCam.ip)).catch((e) => console.log(e));
              }
            }}>
              <IconCom
                name="camera-off"
                size={32}
                color={isError ? 'black' : 'white'}
              />
              <Text style={[
                styles.startStopLabel,
                { color: isError ? 'black' : 'white' },
              ]}>Stop all</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.startStopButton} onPress={async () => {
              Toast.show('Start capturing...');
              setIsError(false);
              setStopRequested(false);
              setPrevGpioCams(null);
              let anySuccess = false;
              for (const gpioCam of gpioCams) {
                try {
                  const res = await startCapture(gpioCam.ip);
                  if (res?.success) {
                    anySuccess = true;
                  }
                  console.log('start req', gpioCam.ip);
                } catch (e) {
                  console.log(e);
                }
              }
              if (anySuccess) {
                setIsCapturing(true);
              }
            }}>
              <Icon
                name="camera-alt"
                size={32}
                color="black"
              />
              <Text style={[styles.startStopLabel, { color: 'black' }]}>Start all</Text>
            </TouchableOpacity>
          )}
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
    // backgroundColor: '#1C463C'
  },
  screenView: {
    width: '100%',
    flex: 1,
  },
  startingContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 2,
    margin: 2,
  },
  scrollContent: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 2,
    margin: 2,
    paddingBottom: 16,
  },
  startStopCardContainer: {
    width: '40%',
    padding: 4,
    margin: 4,
    paddingBottom: 4,
  },
  startStopCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
    paddingVertical: 6,
    paddingHorizontal: 4,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  startStopButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  startStopDivider: {
    width: 2,
    backgroundColor: '#ccc',
    alignSelf: 'stretch',
    marginVertical: 4,
  },
  startStopLabel: {
    color: 'black',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 2,
  },
  connectionStatus: {
    width: '100%',
    backgroundColor: theme.error,
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
  horizontalSpacerWithMargin: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 1,
    marginVertical: 2
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
  errorCard: {
    backgroundColor: theme.error,
    borderRadius: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
    padding: 4,
    width: '100%',
    alignItems: 'center'
  },
});

export default Homescreen;