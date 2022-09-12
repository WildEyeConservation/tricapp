import SmsAndroid from 'react-native-get-sms-android';
import {
  IImageCount,
  IStatus
} from './api_types';
import { phoneNr } from '../screens/SetupScreen';

export const sendSms = (msg: string) => {
  console.log(phoneNr, msg);
  if (phoneNr === '') {
    return;
  }
  SmsAndroid.autoSend(phoneNr, msg,
    (fail: any) => {
      console.log('Failed with this error: ' + fail);
    },
    (success: any) => {
      console.log('SMS sent successfully');
    },
  );
}

export const sendImageCountSms = (data: IImageCount) => {
  let msg = new Date().toISOString();
  msg = msg.concat('\n');
  data.imageCount.forEach((item) => {
    msg = msg.concat(item.toString());
    msg = msg.concat('\n');
  });
  sendSms(msg);
}

export const sendCameraErrorSms = (data: IStatus) => {
  let msg = new Date().toISOString();
  msg = msg.concat('\n');
  data.cams.forEach((item) => {
    msg = msg.concat(item.toString());
    msg = msg.concat('\n');
  });
  sendSms(msg);
}