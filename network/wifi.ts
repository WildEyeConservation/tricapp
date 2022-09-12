import Toast from 'react-native-simple-toast';
import { getVersion } from '../utils/general';
// import { HotspotWizard } from 'react-native-wifi-and-hotspot-wizard';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface IHotspotReturn {
  status: string;
  SSID?: string; // Must be capital letters from library
  password?: string;
}

export const defaultHotspot: IHotspotReturn = {
  status: '',
  SSID: "ESS-ops",
  password: "dumbo2017"
};

const startHotspot = () => {
  const promise = new Promise<IHotspotReturn>((resolve, reject) => {
    resolve({ status: 'enabled' });
    // HotspotWizard.turnOnHotspot(defaultHotspot.SSID, defaultHotspot.password)
    //   .then((res: IHotspotReturn) => {
    //     console.log('startHotspot', res);
    //     if (res.status === 'success' || (res.status === 'auth' && res.SSID && res.password)) {
    //       Toast.show('Hotspot started, waiting for connection...', Toast.SHORT);
    //       resolve(res);
    //     } else {
    //       Toast.show('Hotspot failed', Toast.SHORT);
    //       reject();
    //     }
    //   })
    //   .catch((err: any) => {
    //     console.log(err);
    //     reject()
    //   });
  });

  return promise;
}

export const doHotspot = () => {
  const promise = new Promise<IHotspotReturn>((resolve, reject) => {
    const osVerion = getVersion();
    if (Platform.OS === 'android') {
      if (osVerion < 26) {
        // Wifi library actually does what it's supposed to
        resolve({ status: 'enabled' });
        // HotspotWizard.isHotspotEnabled()
        //   .then((en: boolean) => {
        //     console.log('Enabled', en);
        //     if (!en) {
        //       // not enabled -> start
        //       startHotspot()
        //         .then((res: IHotspotReturn) => { resolve(res) })
        //         .catch(() => { reject() });
        //     } else {
        //       resolve({ status: 'enabled' });
        //     }
        //   })
        //   .catch(() => { });
      } else {
        // Wifi library always return isHotspotEnabled = false incorrectly -> restart connection
        // Wifi library manually changed for this to work -> might break after package update
        // HotspotWizard.isHotspotEnabled()
        //   .then((en: boolean) => {
        //     console.log('Enabled', en);
        //     if (!en) {
        //       // not enabled -> start
        //       AsyncStorage.getItem('@Tricap:useHotspot')
        //         .then((res) => {
        //           console.log(res);
        //           if (res === 'software' || res === '' || res === null) {
        //             startHotspot()
        //               .then((res: IHotspotReturn) => { resolve(res) })
        //               .catch(() => { reject() });
        //           } else {
        //             // use Wifi to connect to pi
        //             resolve({ status: 'enabled' });
        //           }
        //         })
        //         .catch((err) => {
        //           console.log(err);
        //           reject();
        //         });
        //     } else {
        //       resolve({ status: 'enabled' });
        //     }
        //   })
        //   .catch(() => {
        //     console.log('isHotspotEnabled error');
        //     reject();
        //   });
        resolve({ status: 'enabled' });
      }
    } else {
      // TODO: iOS
      reject();
    }
  });

  return promise;
}
