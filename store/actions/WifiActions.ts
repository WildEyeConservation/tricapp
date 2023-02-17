import { RootState } from '../types';
import { ThunkAction } from 'redux-thunk'
import { Action } from 'redux';
import Toast from 'react-native-simple-toast';
import { NativeModules } from 'react-native';
import { getStoredIps } from '../../network/async_storage';

const { NetworkScanner } = NativeModules;

export const DEVICE_IPS = 'DEVICE_IPS';
export const NEW_IP = 'NEW_IP';

export const setIp = (ip: string): ThunkAction<void, RootState, unknown, Action<string>> => async dispatch => {
  dispatch({
    type: NEW_IP,
    payload: {
      ip: ip
    }
  });
}

export const setIps = (ips: string[]): ThunkAction<void, RootState, unknown, Action<string>> => async dispatch => {
  console.log('setIps', ips);
  dispatch({
    type: DEVICE_IPS,
    payload: {
      ips: ips
    }
  });
}