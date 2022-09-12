import { Platform } from 'react-native';
import { RootState } from '../types';
import { ThunkAction } from 'redux-thunk'
import { Action } from 'redux';
import BluetoothSerial from 'react-native-bluetooth-serial';
import { Buffer } from "buffer";
import { Base64 } from 'js-base64';
import { tricap } from '../../out/tricap_pb';
import Toast from 'react-native-simple-toast';

export const CONNECTION_STATE = 'CONNECTION_STATE';
export const DEVICE_IP = 'DEVICE_IP';
export const RESPONSE = 'RESPONSE';
export const WIFI_SETUP_DONE = 'WIFI_SETUP_DONE';

let reconnectInterval: ReturnType<typeof setInterval>;
let txPollingInterval: ReturnType<typeof setInterval>;
let txTimeout: ReturnType<typeof setTimeout>;

const delimiter = Base64.encode('~!');
let stopped = false;

BluetoothSerial.withDelimiter(delimiter)
  .then(() => { })
  .catch((err: any) => console.log(err))

const startup = (): ThunkAction<void, RootState, unknown, Action<string>> => async dispatch => {
  clearInterval(reconnectInterval);
  BluetoothSerial.isEnabled().then((enabled: boolean) => {
    if (enabled) {
      dispatch({
        type: CONNECTION_STATE,
        payload: {
          enabled: true,
        }
      });
      doConnect();
    } else {
      doEnable();
    }
  });
}

const doReconnect = () => {
  console.log('doReconnect');
  clearInterval(txPollingInterval);
  clearInterval(reconnectInterval);
  if (stopped) return;
  reconnectInterval = setInterval(() => {
    doConnect();
  }, 10000); // must be larger than a fixed library timeout -> use 10s
}

const doConnect = () => {
  console.log('doConnect');
  stopped = false;
  BluetoothSerial.list()
    .then((devices: Array<{ id: string, name: string }>) => {
      const tricapDevices = devices.filter(dev => dev.name === 'Tricap');
      if (tricapDevices.length === 0) {
        // no bt devices detected
        Toast.show("No Bluetooth devices paired ", Toast.LONG);      
        return;  
      } else if (tricapDevices.length > 1) {
        // multiple devices detected
        Toast.show("Multiple bluetooth devices paired as \"Tricap\"", Toast.LONG);
        return;
      }
      // only one bluetooth device
      console.log('Connect to', tricapDevices[0])
      if (Platform.OS === 'android') {
        BluetoothSerial.connect(tricapDevices[0].id)
        .then(() => console.log('Connected'))
        .catch(() => console.log('Connection failed'));
      }
    })
    .catch((err: any) => {
      console.log(err);
    });
}

const doEnable = () => {
  if (Platform.OS === 'android') {
    BluetoothSerial.enable()
      .then((res) => console.log('Enabled'))
      .catch((err) => console.log('Enable failed'))
  }
}

const clearBuffer = () => {
  BluetoothSerial.readFromDevice()
    .then((data: string) => console.log(data))
    .catch((err: any) => console.log(err));
}

let eventsRegistered = false
let noResponseCount = 0;
/* This should only be called once on startup */
export const connect = (): ThunkAction<void, RootState, unknown, Action<string>> => async dispatch => {
  let isConnected: boolean;
  try {
    isConnected = await BluetoothSerial.isConnected();
  } catch (e) {
    console.log(e);
    return;
  }

  if (isConnected) {
    clearBuffer();
    dispatch({
      type: CONNECTION_STATE,
      payload: {
        enabled: true,
        connected: true,
      }
    });
    console.log('BT already connected')
    return;
  }

  if (eventsRegistered) {
    // not connected, but already registered
    dispatch(startup());
    return;
  }
  eventsRegistered = true;

  BluetoothSerial.on('bluetoothEnabled', () => {
    console.log('on bluetoothEnabled');
    clearInterval(reconnectInterval);
    doConnect();
    dispatch({
      type: CONNECTION_STATE,
      payload: {
        enabled: true,
      }
    });
  });
  BluetoothSerial.on('bluetoothDisabled', () => {
    console.log('on bluetoothDisabled');
    clearInterval(reconnectInterval);
    dispatch({
      type: CONNECTION_STATE,
      payload: {
        enabled: false,
        connected: false,
      }
    })
  });
  BluetoothSerial.on('connectionLost', () => {
    console.log('on connectionLost');
    dispatch({
      type: CONNECTION_STATE,
      payload: {
        connected: false,
      }
    })
  });
  BluetoothSerial.on('connectionFailed', () => {
    console.log('on connectionFailed', stopped);
    if (!stopped) {
      doReconnect();
    }
    dispatch({
      type: CONNECTION_STATE,
      payload: {
        connected: false,
      }
    });
  });
  BluetoothSerial.on('connectionSuccess', () => {
    console.log('on connectionSuccess');
    clearInterval(reconnectInterval);
    clearInterval(txPollingInterval);
    clearBuffer();
    dispatch({
      type: CONNECTION_STATE,
      payload: {
        connected: true,
      }
    });
  });
  BluetoothSerial.on('error', (err: any) => {
    console.log('on error', err);
    clearInterval(txPollingInterval);
  });
  /* Rx data as base64 */
  BluetoothSerial.on('read', (data: { data: string }) => {
    clearTimeout(txTimeout);
    noResponseCount = 0;
    dispatch({
      type: RESPONSE,
      payload: {
        noResponse: false
      }
    });
    const remTrailer = data.data.replace(delimiter, '');
    let decoded: tricap.Message;
    try {
      decoded = tricap.Message.decode(new Buffer(remTrailer, 'base64'));
    } catch (error) {
      console.log(error);
      return;
    }
    console.log('Rx', decoded);
    switch (decoded.msgType) {
      case tricap.Message.MessageType.IP_ADDRESS:
        if (decoded.ip?.ip === "") {
          return;
        }
        clearInterval(txPollingInterval);
        dispatch({
          type: DEVICE_IP,
          payload: {
            ip: decoded.ip?.ip
          }
        });
        break;
      case tricap.Message.MessageType.WIFI_SETUP:
        clearInterval(txPollingInterval);
        dispatch({
          type: WIFI_SETUP_DONE,
          payload: {
            wifiDone: true
          }
        });
        break;
      default:
        break;
    }
  });

  dispatch(startup());
}

const write = (buffer: Uint8Array): ThunkAction<void, RootState, unknown, Action<string>> => async dispatch => {
  console.log('Tx', buffer);
  BluetoothSerial.write(buffer)
    .then((res: boolean) => { })
    .catch((err: any) => {
      console.log(err);
      Toast.show(err, Toast.SHORT);
    });
  txTimeout = setTimeout(() => {
    noResponseCount++;
    if (noResponseCount > 2) {
      noResponseCount = 0;
      dispatch({
        type: RESPONSE,
        payload: {
          noResponse: true
        }
      });
    }
  }, 500);
}

const pollWrite = (buffer: Uint8Array, interval: number): ThunkAction<void, RootState, unknown, Action<string>> => async dispatch => {
  clearInterval(txPollingInterval);
  if (stopped) return;
  dispatch(write(buffer));
  txPollingInterval = setInterval(() => {
    dispatch(write(buffer));
  }, interval);
}

export const getIpAddress = (): ThunkAction<void, RootState, unknown, Action<string>> => async dispatch => {
  console.log('getIpAddress');
  const msg = tricap.Message.create({
    msgType: tricap.Message.MessageType.IP_ADDRESS,
  });
  const buffer = Buffer.from(tricap.Message.encode(msg).finish());
  dispatch(pollWrite(buffer, 2000));
}

export const wifiSetup = (ssid: string, password: string): ThunkAction<void, RootState, unknown, Action<string>> => async dispatch => {
  console.log('wifiSetup');
  const msg = tricap.Message.create({
    msgType: tricap.Message.MessageType.WIFI_SETUP,
    wifi: {
      ssid: ssid,
      password: password
    }
  });
  const buffer = Buffer.from(tricap.Message.encode(msg).finish());
  dispatch(pollWrite(buffer, 2000));
}

export const stopBluetooth = () => {
  stopped = true;
  clearInterval(reconnectInterval);
  clearInterval(txPollingInterval);
  clearTimeout(txTimeout);
  BluetoothSerial.disconnect()
  .then(() => console.log('Disconnected'))
  .catch(() => console.log('Disconnection failed'));
}