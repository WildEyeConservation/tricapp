import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Switch,
  TouchableOpacity,
  ScrollView
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
import IconCom from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  restartService,
  getStats,
  setCaptureInterval,
  downloadLogs,
  getStatus,
  rebootPi,
  downloadImuLogs,
  downloadGpsLogs,
  startBackup,
  getBackupStatus,
  stopBackup,
  verifyAndDelete,
  forceDelete,
  getImages,
  setNetbirdKey,
  netbirdConnect,
  netbirdDisconnect,
  getNetbirdStatus
} from '../network/api';
import { getStoredIps, getCaptureInterval } from '../network/async_storage'
import { IGpioCamera, IGpioCameraSettings, IStatus, IBackupStatus, INetbirdStatus } from '../network/api_types';
import { setIp, setIps } from '../store/actions/WifiActions';
import confirm from '../components/Alert';
import { formatSeconds } from '../components/Utils';
import IPv4Prompt from '../components/IPv4Prompt';

interface ISelectIp {
  (ip: string): void;
}

interface ISelectCamera {
  (ip: number): void;
}

export let phoneNr = '';

const renderFixedCols = (item: string | number, key: string) => {
  return (
    <View style={{ flex: 1, alignItems: 'flex-start' }} key={key}>
      <Text style={styles.textBold}>{item}</Text>
    </View>
  )
}

const renderSettings = (item: IGpioCameraSettings, key: string, removeDevice: ISelectIp, selectDevice: ISelectIp, selectedIdx: number) => {
  return (
    <TouchableOpacity style={{ flexDirection: 'row', padding: 5, alignItems: 'center' }} key={key} onPress={() => {
      console.log('select', item.ip);
      selectDevice(item.ip);
    }}>
      <View style={{ flex: 1 }}>
        <Text style={key === selectedIdx.toString() ? styles.textBold : styles.textNormal}>{item.ip}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.textNormal}>{item.captureInterval}s</Text>
      </View>
      <TouchableOpacity style={{ flex: 1, alignItems: 'flex-end' }} onPress={() => {
        console.log('do remove');
        removeDevice(item.ip);
      }}>
        <Icon name="delete" size={30} color={'black'} />
      </TouchableOpacity>
    </TouchableOpacity >
  )
}

const renderCameras = (key: number, selectCamera: ISelectCamera) => {
  return (
    <MyButton
      title={`Cam ${(key + 1).toString()}`}
      key={key.toString()}
      width={70}
      onPress={() => { selectCamera(key) }}
    ></MyButton>
  )
}

const SetupScreen = ({ route, navigation }: SetupProps) => {
  const dispatch = useDispatch();
  const getStatusInterval = useRef<NodeJS.Timer | null>(null);
  const getBackupStatusInterval = useRef<NodeJS.Timer | null>(null);

  const ips = useSelector((state: RootState) => state.wifi.ips);

  const [gpioCams, setGpioCams] = useState<IGpioCameraSettings[]>([]);
  const [newCaptureInterval, setNewCaptureInterval] = useState<number>(3.0);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [piStatus, setPiStatus] = useState<IStatus>();
  const [lastGpsUpdate, setLastGpsUpdate] = useState<number>(0);
  const [backupStatus, setBackupStatus] = useState<IBackupStatus>();
  const [addIpVisible, setAddIpVisible] = useState(false);
  const [netbirdKey, setNetbirdKeyValue] = useState<string>('');
  const [netbirdStatus, setNetbirdStatus] = useState<INetbirdStatus | null>(null);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => {
            setAddIpVisible(true);
          }}>
            <Icon name="add" size={30} color={'black'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            Toast.show('Refreshing...');
            buildNetwork(ips).then((detected) => { setGpioCams(detected); }).catch((e) => console.log(e));
          }}>
            <Icon name="refresh" size={30} color={'black'} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      if (getStatusInterval.current) {
        clearInterval(getStatusInterval.current);
      }

      const checkStatus = () => {
        if (selectedIdx < gpioCams.length) {
          getStatus(gpioCams[selectedIdx].ip).then((retStatus) => {
            setPiStatus(retStatus);
            if (retStatus.gps.lastUpdate !== undefined) {
              if (retStatus.gps.lastUpdate > 0) {
                setLastGpsUpdate(Math.min(retStatus.gps.lastUpdate, 999))
              } else {
                setLastGpsUpdate(999)
              }
            }
          }).catch((e) => { console.log(e); setLastGpsUpdate((val) => Math.min(val + 2, 999)) });
        }
      };

      checkStatus();

      getStatusInterval.current = setInterval(checkStatus, 2000);

      return () => {
        console.log('stop refresh')
        clearInterval(getStatusInterval.current);
      }
    }, [selectedIdx, gpioCams])
  );

  useEffect(() => {
    getStoredIps().then((storedIps) => {
      if (storedIps !== undefined && storedIps.length > 0) {
        dispatch(setIps(storedIps));
      }
    }).catch((e) => console.log(e));
    getCaptureInterval().then((interval) => {
      console.log('getCaptureInterval', interval);
      if (interval !== undefined && interval != '') {
        const floatInterval = parseFloat(interval);
        if (!isNaN(floatInterval)) {
          setNewCaptureInterval(floatInterval);
        }
      }
    });
  }, []);

  useEffect(() => {
    buildNetwork(ips).then((detected) => { setGpioCams(detected); }).catch((e) => console.log(e));
  }, [ips]);

  useEffect(() => {
    if (selectedIdx < gpioCams.length) {
      console.log('Update Backup Status')
      getBackupStatus(gpioCams[selectedIdx].ip).then((res) => {
        setBackupStatus(res);
      }).catch((e) => console.log(e));
      // Fetch netbird status when device is selected
      getNetbirdStatus(gpioCams[selectedIdx].ip).then((res) => {
        setNetbirdStatus(res);
      }).catch((e) => console.log(e));
    }
  }, [gpioCams, selectedIdx]);

  useEffect(() => {
    if (backupStatus?.running) {
      clearInterval(getStatusInterval.current);
      clearInterval(getBackupStatusInterval.current);
      getBackupStatusInterval.current = setInterval(() => {
        console.log('Update Backup Status')
        getBackupStatus(gpioCams[selectedIdx].ip).then((res) => {
          setBackupStatus(res);
        }).catch((e) => console.log(e));
      }, 10000);
    } else {
      console.log('clearInterval Backup Status')
      clearInterval(getBackupStatusInterval.current);
    }
  }, [backupStatus]);

  const buildNetwork = async (ips: string[]) => {
    const newGpioCams: IGpioCameraSettings[] = []; // make copy
    for (const ip of ips) {
      try {
        const stats = await getStats(ip);
        newGpioCams.push({
          ip: ip,
          captureInterval: stats.captureInterval,
        });
      } catch (e) {
        newGpioCams.push({
          ip: ip,
          captureInterval: 0,
        });
      }
    }
    return newGpioCams;
  }

  const updateCaptureInterval = async (interval: number) => {
    const roundedNum = Math.round(interval * 10) / 10;
    try {
      for (const gpioCam of gpioCams) {
        await setCaptureInterval(gpioCam.ip, roundedNum).then(() => { }).catch((e) => console.log(e));
      }
    } catch (e) {
      console.log(e)
    }
    try {
      await AsyncStorage.setItem('@Tricap:captureInterval', roundedNum.toString());
      const detectedCams = await buildNetwork(ips);
      setGpioCams(detectedCams);
      setNewCaptureInterval(roundedNum);
    } catch (e) {
      console.log(e)
    }
  }

  if (gpioCams.length === 0 && !addIpVisible) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.screenView}>
          <View style={{ ...styles.card, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={styles.textBold}>No devices</Text>
            <ActivityIndicator size="small" color='black' />
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView 
        style={{ width: '100%' }}
        contentContainerStyle={{ alignItems: 'center', justifyContent: 'flex-start', padding: 2, margin: 2 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {gpioCams.length === 0 ? <View></View> : (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', padding: 5 }}>
              {["Device", "Interval", ""].map((item, index) => (
                renderFixedCols(item, index.toString())
              ))}
            </View>
            <View style={styles.horizontalSpacer}></View>
            {gpioCams.map((item, index: number) => (
              renderSettings(item, index.toString(), (ret) => {
                Toast.show('Removing...');
                const filteredIps = ips.filter((ip: string) => ip !== ret);
                console.log('filteredIps', filteredIps);
                AsyncStorage.setItem('@Tricap:ips', JSON.stringify(filteredIps)).then(() => { }).catch(e => console.log(e));
                dispatch(setIps(filteredIps));
              },
                () => { setSelectedIdx(index); },
                selectedIdx)
            ))}
          </View>)}
        {gpioCams.length > 0 && <View style={styles.horizontalSpacerThick}></View>}
        {gpioCams.length > 0 && <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.textNormal}>Wi-Fi:</Text>
            <Text style={styles.textNormal}>{piStatus ? piStatus.wifiSignal : 0}dBm</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.textNormal}>GPS:</Text>
            <Text style={styles.textNormal}>Satellites: {piStatus?.gps.satellites ? piStatus.gps.satellites : 0}</Text>
            <Text style={styles.textNormal}>PDOP: {piStatus?.gps.pdop ? piStatus.gps.pdop : 0}</Text>
            <Text style={styles.textNormal}>{lastGpsUpdate.toFixed(1)}s ago</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.textNormal}>SNR:</Text>
            <Text style={styles.textNormal}>Min: {piStatus?.gps.min ? piStatus.gps.min : 0}</Text>
            <Text style={styles.textNormal}>Avg: {piStatus?.gps.avg ? piStatus.gps.avg.toFixed(0) : 0}</Text>
            <Text style={styles.textNormal}>Max: {piStatus?.gps.max ? piStatus.gps.max : 0}</Text>
          </View>
        </View>}
        {gpioCams.length > 0 && <View style={styles.horizontalSpacerWithMargin}></View>}
        {gpioCams.length > 0 && <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.textNormal}>Set interval:</Text>
            <MyButton
              title='-0.5'
              width={50}
              onPress={async () => {
                updateCaptureInterval(newCaptureInterval - 0.5).then(() => { }).catch((e) => console.log(e));
              }}
            ></MyButton>
            <MyButton
              title='-0.1'
              width={50}
              onPress={async () => {
                updateCaptureInterval(newCaptureInterval - 0.1).then(() => { }).catch((e) => console.log(e));
              }}
            ></MyButton>
            <Text style={styles.textNormal}>{newCaptureInterval}s</Text>
            <MyButton
              title='+0.1'
              width={50}
              onPress={async () => {
                updateCaptureInterval(newCaptureInterval + 0.1).then(() => { }).catch((e) => console.log(e));
              }}
            ></MyButton>
            <MyButton
              title='+0.5'
              width={50}
              onPress={async () => {
                updateCaptureInterval(newCaptureInterval + 0.5).then(() => { }).catch((e) => console.log(e));
              }}
            ></MyButton>
          </View>
        </View>}
        {gpioCams.length > 0 && <View style={styles.horizontalSpacerWithMargin}></View>}
        {selectedIdx < gpioCams.length && <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.textNormal}>Download logs:</Text>
            <MyButton
              title='Main'
              width={70}
              onPress={async () => {
                Toast.show('Downloading...');
                try {
                  await downloadLogs(gpioCams[selectedIdx].ip)
                  Toast.show('Download complete');
                } catch {
                  console.log('download logs failed')
                }
              }}
            ></MyButton>
            <MyButton
              title='IMU'
              width={70}
              onPress={async () => {
                Toast.show('Downloading...');
                try {
                  await downloadImuLogs(gpioCams[selectedIdx].ip)
                  Toast.show('Download complete');
                } catch {
                  console.log('download logs failed')
                }
              }}
            ></MyButton>
            <MyButton
              title='GPS'
              width={70}
              onPress={async () => {
                Toast.show('Downloading...');
                try {
                  await downloadGpsLogs(gpioCams[selectedIdx].ip)
                  Toast.show('Download complete');
                } catch {
                  console.log('download logs failed')
                }
              }}
            ></MyButton>
          </View>
        </View>}
        {gpioCams.length > 0 && <View style={styles.horizontalSpacerWithMargin}></View>}
        {gpioCams.length > 0 && <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.textNormal}>Restart:</Text>
            <MyButton
              title='Tricap service'
              width={120}
              onPress={() => {
                Toast.show('Restarting...');
                restartService(gpioCams[selectedIdx].ip).then((res) => { }).catch((e) => console.log(e));
              }}
            ></MyButton>
            <MyButton
              title='Raspberry pi'
              width={120}
              onPress={() => {
                Toast.show('Rebooting...');
                rebootPi(gpioCams[selectedIdx].ip).then((res) => { }).catch((e) => console.log(e));
              }}
            ></MyButton>
          </View>
        </View>}
        {gpioCams.length > 0 && <View style={styles.horizontalSpacerWithMargin}></View>}
        {gpioCams.length > 0 && <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.textNormal}>Backup:</Text>
            {backupStatus && <Text style={styles.textNormal}>{backupStatus?.message}</Text>}
            {backupStatus && backupStatus.running && <Text style={styles.textNormal}>ETA: {backupStatus?.eta_seconds ? formatSeconds(backupStatus.eta_seconds) : 0}</Text>}
            <MyButton
              title={backupStatus === undefined ? 'Start' : backupStatus.running === false ? 'Start' : 'Stop'}
              disabled={!((backupStatus === undefined) || (backupStatus.running === false) || (backupStatus.phase === 'copying'))}
              width={70}
              onPress={() => {
                if ((backupStatus === undefined) || (backupStatus.running === false)) {
                  Toast.show('Starting...');
                  startBackup(gpioCams[selectedIdx].ip).then((res) => {
                    if (res.msg) {
                      Toast.show(res.msg);
                    }
                  }).then((e) => console.log(e))
                  setBackupStatus({
                    running: true,
                    phase: "idle",
                    message: "Start requested",
                    percent: 0,
                    bytes_done: 0,
                    bytes_total: 0,
                    files_done: 0,
                    files_total: 0,
                    eta_seconds: null,
                  })
                } else {
                  Toast.show('Stopping...');
                  stopBackup(gpioCams[selectedIdx].ip).then((res) => { }).catch((e) => console.log(e));
                }
              }}
            ></MyButton>
            {(backupStatus === undefined || backupStatus.running === false) && <MyButton
              title='Delete'
              width={70}
              onPress={async () => {
                if (await confirm('Delete item?', 'This cannot be undone', { destructive: true, confirmText: 'Delete' })) {
                  Toast.show('Verifying...');
                  verifyAndDelete(gpioCams[selectedIdx].ip).then(async (res) => {
                    console.log('res', res)
                    if (res.success) {
                      Toast.show('Deleting...');
                    } else {
                      if (await confirm('Backup not verified', 'Delete anyway?', { destructive: true, confirmText: 'Delete' })) {
                        Toast.show('Deleting...');
                        forceDelete(gpioCams[selectedIdx].ip).then((res) => { }).catch((e) => console.log(e))
                      }
                    }
                  }).catch((e) => console.log(e));
                }
              }}
            ></MyButton>}
          </View>
          {backupStatus && backupStatus.phase === 'copying' && <View style={{ flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.textNormal}>Files:</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.textNormal}>{backupStatus?.files_done}</Text>
                <Text style={styles.textNormal}>/</Text>
                <Text style={styles.textNormal}>{backupStatus?.files_total}</Text>
              </View>
              <Text style={styles.textNormal}>{backupStatus.files_total > 0 ?
                (backupStatus.files_done / backupStatus.files_total * 100).toFixed(0) : 0}%</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.textNormal}>Bytes:</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.textNormal}>{(backupStatus.bytes_done / 1048576).toFixed(0)}MB</Text>
                <Text style={styles.textNormal}>/</Text>
                <Text style={styles.textNormal}>{(backupStatus.bytes_total / 1048576).toFixed(0)}MB</Text>
              </View>
              <Text style={styles.textNormal}>{backupStatus.bytes_total > 0 ?
                (backupStatus.bytes_done / backupStatus.bytes_total * 100).toFixed(0) : 0}%</Text>
            </View>
          </View>}
        </View>}
        {gpioCams.length > 0 && <View style={styles.horizontalSpacerWithMargin}></View>}
        {selectedIdx < gpioCams.length && piStatus && <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.textNormal}>Download images:</Text>
            {/* <View style={{ flexDirection: 'row', width: '100%' }}> */}
            {piStatus.cams.map((item, index) => (renderCameras(index, async (selectedCamIdx) => {
              console.log('index', selectedCamIdx)
              Toast.show('Downloading...');
              try {
                await getImages(gpioCams[selectedIdx].ip, selectedCamIdx)
                Toast.show('Download complete');
              } catch {
                console.log('download images failed')
              }
            })))}
          </View>
        </View>}
        {gpioCams.length > 0 && <View style={styles.horizontalSpacerWithMargin}></View>}
        {selectedIdx < gpioCams.length && <View style={styles.card}>
          <View style={{ flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.textNormal}>Netbird Status:</Text>
              {netbirdStatus && netbirdStatus.connected && (
                <Text style={[styles.textNormal, { color: 'green', marginLeft: 10 }]}>Connected</Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 10 }]}
                value={netbirdKey}
                onChangeText={setNetbirdKeyValue}
                placeholder="A9F88EE3-B2ED-4EE6-8B4C-884FC7B4725F"
                placeholderTextColor="#999"
              />
              <MyButton
                title='Set Key'
                width={100}
                onPress={async () => {
                  if (!netbirdKey.trim()) {
                    Toast.show('Please enter a netbird key');
                    return;
                  }
                  Toast.show('Setting netbird key...');
                  try {
                    const result = await setNetbirdKey(gpioCams[selectedIdx].ip, netbirdKey.trim());
                    if (result.success) {
                      Toast.show('Netbird key set successfully');
                      // Set status based on success
                      setNetbirdStatus({
                        success: true,
                        connected: true,
                      });
                    } else {
                      Toast.show(result.msg || 'Failed to set netbird key');
                      setNetbirdStatus({
                        success: false,
                        connected: false,
                      });
                    }
                  } catch (e) {
                    console.log('setNetbirdKey failed', e);
                    Toast.show('Failed to set netbird key');
                    setNetbirdStatus({
                      success: false,
                      connected: false,
                    });
                  }
                }}
              ></MyButton>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10 }}>
              <MyButton
                title='Connect'
                width={100}
                onPress={async () => {
                  Toast.show('Connecting...');
                  try {
                    const result = await netbirdConnect(gpioCams[selectedIdx].ip);
                    if (result.success) {
                      if (result.msg) {
                        Toast.show(result.msg);
                      } else {
                        Toast.show('Netbird connected successfully');
                      }
                      // Set status based on success
                      setNetbirdStatus({
                        success: true,
                        connected: true,
                      });
                    } else {
                      Toast.show(result.msg || 'Failed to connect netbird');
                      setNetbirdStatus({
                        success: false,
                        connected: false,
                      });
                    }
                  } catch (e) {
                    console.log('netbirdConnect failed', e);
                    Toast.show('Failed to connect netbird');
                    setNetbirdStatus({
                      success: false,
                      connected: false,
                    });
                  }
                }}
              ></MyButton>
              <View style={{ marginLeft: 10 }}>
                <MyButton
                  title='Disconnect'
                  width={100}
                  onPress={async () => {
                    Toast.show('Disconnecting...');
                    try {
                      const result = await netbirdDisconnect(gpioCams[selectedIdx].ip);
                      if (result.success) {
                        if (result.msg) {
                          Toast.show(result.msg);
                        } else {
                          Toast.show('Netbird disconnected successfully');
                        }
                        // Set status based on success
                        setNetbirdStatus({
                          success: true,
                          connected: false,
                        });
                      } else {
                        Toast.show(result.msg || 'Failed to disconnect netbird');
                        // Keep current status if disconnect failed
                      }
                    } catch (e) {
                      console.log('netbirdDisconnect failed', e);
                      Toast.show('Failed to disconnect netbird');
                      // Keep current status on error
                    }
                  }}
                ></MyButton>
              </View>
              <View style={{ marginLeft: 10, flexDirection: 'row', alignItems: 'center' }}>
                <MyButton
                  title='Status'
                  width={100}
                  onPress={async () => {
                    Toast.show('Checking status...');
                    try {
                      const status = await getNetbirdStatus(gpioCams[selectedIdx].ip);
                      setNetbirdStatus(status);
                      Toast.show(status.connected ? 'Netbird is connected' : 'Netbird is disconnected');
                    } catch (e) {
                      console.log('getNetbirdStatus failed', e);
                      Toast.show('Failed to get netbird status');
                    }
                  }}
                ></MyButton>
              </View>
            </View>
          </View>
        </View>}
      </ScrollView>
      <IPv4Prompt
        visible={addIpVisible}
        initialValue={""}
        title="Add IP address"
        confirmText="Add"
        cancelText="Cancel"
        onCancel={() => setAddIpVisible(false)}
        onConfirm={(value: string) => {
          Toast.show('Adding...');
          setAddIpVisible(false);
          dispatch(setIp(value));
          // You could also persist it, e.g. AsyncStorage.setItem("server_ip", value)
        }}
      />
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
    padding: 2,
    margin: 2
  },
  input: {
    marginHorizontal: 10,
    borderBottomWidth: 1,
    color: 'black'
  },
  horizontalSpacer: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 1,
  },
  horizontalSpacerWithMargin: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 1,
    marginVertical: 2
  },
  horizontalSpacerThick: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 2,
    marginVertical: 5
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

export default SetupScreen;