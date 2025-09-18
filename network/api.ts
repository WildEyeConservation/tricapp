import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import _ from 'lodash';
import { storeExifSessions, getStoredExifSession, storeExifSessionIds, getStoredExifSessionIds } from './async_storage';
import {
  IExifSessions,
  IExifSessionIds,
  IStatus,
  IStats,
  ICopyEta,
  IImageCount,
  ILensNumber,
  IReturnStatus,
  IBackupStatus
} from './api_types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-simple-toast';
import RNBlobUtil from 'react-native-blob-util';

// const SERVER_IP = 'https://79dcc177-303f-496b-b6ee-c818b70db5f8.mock.pstmn.io';
// const SERVER_IP = 'https://elephants.hopto.org:443';
const SERVER_IP = 'https://detweb.hopto.org:443';
const TIMEOUT = 2000;

let syncing = false;
export const syncExif = async (ip: string) => {
  const netInfo = await NetInfo.fetch();

  if (ip !== '') {
    try {
      await syncFromPi(ip, netInfo);
      await syncFromLocalStorage(netInfo);
      return "Sync successful";
    } catch (e) {
      return e;
    }
  } else {
    try {
      await syncFromLocalStorage(netInfo);
      return "Synched from local storage";
    } catch (e) {
      return e;
    }
  }
}

export const unsubscribe = NetInfo.addEventListener((state) => {
  console.log("Connection type", state.isConnected);
  if (state.isConnected) {
    // check if there are locally stored data to transmit
    if (!syncing) {
      // the event listener calls this 3 times -> avoid by checking bool status
      syncing = true;
      syncExif('').then(() => { syncing = false; }).catch((err) => {
        console.log(err.toString());
        syncing = false;
      });
    }
  } else {
    syncing = false;
  }
});

export const getStatus = (reqIp: string) => {
  const promise = new Promise<IStatus>((resolve, reject) => {
    Promise.race<IStatus>([
      new Promise((resolve, reject) => fetch(`http://${reqIp}:5000/api/status`)
        .then(res => res.json())
        .then((res: IStatus) => {
          resolve(res);
        })
        .catch((err: any) => {
          reject(err);
        })),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT)
      )
    ])
      .then((res: IStatus) => {
        resolve(res);
      })
      .catch((err: any) => {
        reject(err);
      });
  });
  return promise;
}

export const getStats = (reqIp: string) => {
  const promise = new Promise<IStats>((resolve, reject) => {
    Promise.race<IStats>([
      new Promise((resolve, reject) => fetch(`http://${reqIp}:5000/api/statistics`)
        .then(res => res.json())
        .then((res: IStats) => {
          if (res.msg) {
            Toast.show(res.msg);
          }
          resolve(res);
        })
        .catch((err: any) => {
          reject(err);
        })),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT)
      )
    ])
      .then((res: IStats) => {
        resolve(res);
      })
      .catch((err: any) => {
        reject(err);
      });
  });
  return promise;
}

export const getCopyEta = (reqIp: string) => {
  const promise = new Promise<ICopyEta>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/copy_eta`).then(async res => {
      const contentType = res.headers.get("content-type");
      if (res.status === 400 && contentType && contentType.indexOf("application/json") !== -1) {
        try {
          const msgBody = await res.json();
          if (msgBody.msg) {
            throw new Error(msgBody.msg);
          }
          throw new Error("Bad response from server");
        } catch (e) {
          throw e;
        }
      } else if (res.status >= 400 && res.status < 600) {
        throw new Error("Bad response from server");
      } else {
        return res.json();
      }
    })
      .then((res: ICopyEta) => {
        resolve(res);
      })
      .catch((err: any) => {
        console.log('getCopyEta', err.toString());
        reject(err);
      });
  });
  return promise;
}

export const getExifSessions = (reqIp: string, sessionIds: IExifSessionIds) => {
  const promise = new Promise<IExifSessions>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/exif_info`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sessionIds)
      }).then(async res => {
        const contentType = res.headers.get("content-type");
        if (res.status === 400 && contentType && contentType.indexOf("application/json") !== -1) {
          try {
            const msgBody = await res.json();
            if (msgBody.msg) {
              throw new Error(msgBody.msg);
            }
            throw new Error("Bad response from server");
          } catch (e) {
            throw e;
          }
        } else if (res.status >= 400 && res.status < 600) {
          throw new Error("Bad response from server");
        } else {
          return res.json();
        }
      })
      .then((res: IExifSessions) => {
        resolve(res);
      })
      .catch((err: any) => {
        console.log('getExifSessions', err.toString());
        reject(err);
      });
  });

  return promise;
}

export const getExifSessionIds = (reqIp: string) => {
  const promise = new Promise<IExifSessionIds>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/exif_sessions`).then(async res => {
      const contentType = res.headers.get("content-type");
      if (res.status === 400 && contentType && contentType.indexOf("application/json") !== -1) {
        try {
          const msgBody = await res.json();
          if (msgBody.msg) {
            throw new Error(msgBody.msg);
          }
          throw new Error("Bad response from server");
        } catch (e) {
          throw e;
        }
      } else if (res.status >= 400 && res.status < 600) {
        throw new Error("Bad response from server");
      } else {
        return res.json();
      }
    })
      .then((res: IExifSessionIds) => {
        console.log(res);
        resolve(res);
      })
      .catch((err: any) => {
        console.log('getExifSessionIds', err.toString());
        reject(err);
      });
  });
  return promise;
}

export const sendExifSessions = (data: IExifSessions) => {
  console.log('sendExifSessions length', data.sessions.length);
  // console.log(JSON.stringify(data));
  try {
    if (data.sessions.length > 0) {
      console.log(data.sessions[0].sessionInfo.length);
      if (data.sessions[0].sessionInfo.length > 0) {
        console.log(data.sessions[0].sessionInfo[0].exifInfo.length);
        if (data.sessions[0].sessionInfo[0].exifInfo.length > 0) {
          console.log(data.sessions[0].sessionId, JSON.stringify(data.sessions[0].sessionInfo[0].exifInfo[0]));
        }
      }
    }
  } catch (e) {
    console.log(`Print exif session failed {e}`);
  }

  const promise = new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Fetch timeout"));
    }, 5000);
    fetch(`${SERVER_IP}/api/exif_info`,
      {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then((res) => {
        clearTimeout(timeoutId);
        resolve();
      })
      .catch((err) => {
        console.log('sendExifSessions', err.toString());
        reject(err);
      });
  });
  return promise;
}

export const sendExifSessionIds = (data: IExifSessionIds) => {
  console.log('sendExifSessionIds', data);
  const promise = new Promise<IExifSessionIds>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Fetch timeout"));
    }, 1000);
    fetch(`${SERVER_IP}/api/exif_sessions`,
      {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(res => res.json())
      .then((res: IExifSessionIds) => {
        console.log(res);
        clearTimeout(timeoutId);
        resolve(res);
      })
      .catch((err) => {
        console.log('sendExifSessionIds', err.toString());
        reject(err);
      });
  });
  return promise;
}

export const getImageCount = (reqIp: string) => {
  const promise = new Promise<IImageCount>((resolve, reject) => {
    Promise.race<IImageCount>([
      new Promise((resolve, reject) => fetch(`http://${reqIp}:5000/api/images_captured`)
        .then(res => res.json())
        .then((res: IImageCount) => {
          resolve(res);
        })
        .catch((err: any) => {
          reject(err);
        })),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT)
      )
    ])
      .then((res: IImageCount) => {
        resolve(res);
      })
      .catch((err: any) => {
        reject(err);
      });
  });
  return promise;
}

const syncFromPi = async (ip: string, netInfo: NetInfoState) => {
  console.log('syncFromPi', netInfo.isConnected, ip);
  let availableIds: IExifSessionIds = { sessionIds: [] };
  try {
    availableIds = await getExifSessionIds(ip);
  } catch (e) {
    throw 'Sync to local storage failed';
  }

  if (netInfo.isConnected) {
    // has internet
    try {
      const missingIds = await sendExifSessionIds(availableIds);
      const exifSessions = await getExifSessions(ip, missingIds);
      Toast.show(`Syncing ${exifSessions.sessions.length} sessions...`, Toast.SHORT);
      let updatedMissingIds: IExifSessionIds = { sessionIds: [] };
      // exifSessions could be very large -> send one by one
      console.log('syncFromPi', availableIds.sessionIds.length, missingIds.sessionIds.length, exifSessions.sessions.length)
      for (const exifSession of exifSessions.sessions) {
        try {
          await sendExifSessions({ sessions: [exifSession] });
          await AsyncStorage.removeItem(`@Tricap:sessions${exifSession.sessionId}`);
        } catch (e) {
          console.log(e);
          updatedMissingIds.sessionIds.push(exifSession.sessionId);
        }
      }
      await storeExifSessionIds(updatedMissingIds);
    } catch (e) {
      // send failed -> save to local storage
      try {
        const exifSessions = await getExifSessions(ip, availableIds);
        await storeExifSessions(exifSessions); // call before storeExifSessionIds
        await storeExifSessionIds(availableIds);
      } catch (e) {
        throw 'Sync to local storage failed';
      }
      throw 'Synched to local storage';
    }
  } else {
    // no internet -> save to local storage
    try {
      const exifSessions = await getExifSessions(ip, availableIds);
      await storeExifSessions(exifSessions); // call before storeExifSessionIds
      await storeExifSessionIds(availableIds);
    } catch (e) {
      throw 'Sync to local storage failed';
    }
    throw 'Synched to local storage';
  }
}

const syncFromLocalStorage = async (netInfo: NetInfoState) => {
  console.log('syncLocalStorage', netInfo.isConnected);
  if (!netInfo.isConnected) {
    throw 'Sync from local storage failed';
  }

  // has internet
  const availableIds = await getStoredExifSessionIds();
  if (availableIds) {
    try {
      const missingIds = await sendExifSessionIds(availableIds);
      Toast.show(`Syncing ${missingIds.sessionIds.length} local sessions...`, Toast.SHORT);
      let updatedMissingIds: IExifSessionIds = { sessionIds: [] };
      for (const missingId of missingIds.sessionIds) {
        try {
          const storedSession = await getStoredExifSession(missingId);
          await sendExifSessions({ sessions: [storedSession] });
          await AsyncStorage.removeItem(`@Tricap:sessions${missingId}`);
        } catch (e) {
          console.log(e);
          updatedMissingIds.sessionIds.push(missingId);
        }
      }
      await storeExifSessionIds(updatedMissingIds);
    } catch (e) {
      throw 'Sync from local storage failed';
    }
  } else {
    throw 'Nothing to sync from local storage';
  }
}

export const getLensNumber = (reqIp: string) => {
  const promise = new Promise<ILensNumber>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/lensNumber`).then(res => res.json())
      .then((res: ILensNumber) => {
        console.log(res);
        resolve(res);
      })
      .catch((err: any) => {
        console.log('getLensNumber', err.toString());
        reject(err);
      });
  });
  return promise;
}

export const restartService = (reqIp: string) => {
  const promise = new Promise<IReturnStatus>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/restart`).then(res => res.json())
      .then((res: IReturnStatus) => {
        resolve(res);
      })
      .catch((err: any) => {
        console.log('restartService', err.toString());
        reject(err);
      });
  });
  return promise;
}

export const rebootPi = (reqIp: string) => {
  const promise = new Promise<IReturnStatus>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/reboot`).then(res => res.json())
      .then((res: IReturnStatus) => {
        resolve(res);
      })
      .catch((err: any) => {
        console.log('rebootPi', err.toString());
        reject(err);
      });
  });
  return promise;
}

export const doPreview = (reqIp: string) => {
  const promise = new Promise<IReturnStatus>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/do_preview`).then(res => res.json())
      .then((res: IReturnStatus) => {
        resolve(res);
      })
      .catch((err: any) => {
        console.log('doPreview', err.toString());
        reject(err);
      });
  });
  return promise;
}

export const startCapture = (reqIp: string) => {
  const promise = new Promise<IReturnStatus>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/start_capture`).then(res => res.json())
      .then((res: IReturnStatus) => {
        if (res.msg) {
          Toast.show(res.msg);
        }
        resolve(res);
      })
      .catch((err: any) => {
        console.log('startCapture', err.toString());
        reject(err);
      });
  });
  return promise;
}

export const stopCapture = (reqIp: string) => {
  const promise = new Promise<IReturnStatus>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/stop_capture`).then(res => res.json())
      .then((res: IReturnStatus) => {
        if (res.msg) {
          Toast.show(res.msg);
        }
        resolve(res);
      })
      .catch((err: any) => {
        console.log('stopCapture', err.toString());
        reject(err);
      });
  });
  return promise;
}

export const setCaptureInterval = (reqIp: string, interval: number) => {
  const promise = new Promise<IReturnStatus>((resolve, reject) => {
    Promise.race<IReturnStatus>([
      new Promise((resolve, reject) => fetch(`http://${reqIp}:5000/api/capture_interval`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            interval: interval
          })
        })
        .then(async res => {
          const contentType = res.headers.get("content-type");
          if (res.status === 400 && contentType && contentType.indexOf("application/json") !== -1) {
            try {
              const msgBody = await res.json();
              if (msgBody.msg) {
                throw new Error(msgBody.msg);
              }
              throw new Error("Bad response from server");
            } catch (e) {
              throw e;
            }
          } else if (res.status >= 400 && res.status < 600) {
            throw new Error("Bad response from server");
          } else {
            return res.json();
          }
        })
        .then((res: IReturnStatus) => {
          resolve(res);
        })
        .catch((err: any) => {
          reject(err);
        })),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT)
      )
    ])
      .then((res: IReturnStatus) => {
        resolve(res);
      })
      .catch((err: any) => {
        reject(err);
      });
  });
  return promise;
}

export async function downloadLogs(reqIp: string) {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const filename = `tricap_master_${timestamp}.log`;
  const target = `/storage/emulated/0/Download/${filename}`;

  // Overwrite any previous file; no resume
  const task = RNBlobUtil
    .config({ path: target, fileCache: true, overwrite: true })
    .fetch('GET', `http://${reqIp}:5000/api/download_logs`)
    .progress({ count: 10 }, (received, total) => {
      if (total > 0) {
        console.log(`Progress: ${((received / total) * 100).toFixed(1)}%`);
      } else {
        console.log(`Received: ${received} bytes`);
      }
    });

  const res = await task;
  console.log('Saved to:', res.path(), 'status:', res.info().status);
  return res.path();
}

export async function downloadImuLogs(reqIp: string) {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const filename = `accelData_${timestamp}.bin`;
  const target = `/storage/emulated/0/Download/${filename}`;

  // Overwrite any previous file; no resume
  const task = RNBlobUtil
    .config({ path: target, fileCache: true, overwrite: true })
    .fetch('GET', `http://${reqIp}:5000/api/download_imu_logs`)
    .progress({ count: 10 }, (received, total) => {
      if (total > 0) {
        console.log(`Progress: ${((received / total) * 100).toFixed(1)}%`);
      } else {
        console.log(`Received: ${received} bytes`);
      }
    });

  const res = await task;
  console.log('Saved to:', res.path(), 'status:', res.info().status);
  return res.path();
}

export async function downloadGpsLogs(reqIp: string) {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const filename = `gpsData_${timestamp}.csv`;
  const target = `/storage/emulated/0/Download/${filename}`;

  // Overwrite any previous file; no resume
  const task = RNBlobUtil
    .config({ path: target, fileCache: true, overwrite: true })
    .fetch('GET', `http://${reqIp}:5000/api/download_gps_logs`)
    .progress({ count: 10 }, (received, total) => {
      if (total > 0) {
        console.log(`Progress: ${((received / total) * 100).toFixed(1)}%`);
      } else {
        console.log(`Received: ${received} bytes`);
      }
    });

  const res = await task;
  console.log('Saved to:', res.path(), 'status:', res.info().status);
  return res.path();
}

export async function startBackup(reqIp: string) {
  const promise = new Promise<IReturnStatus>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/backup_start`).then(res => res.json())
      .then((res: IReturnStatus) => {
        resolve(res);
      })
      .catch((err: any) => {
        console.log('startBackup', err.toString());
        reject(err);
      });
  });
  return promise;
}

export async function getBackupStatus(reqIp: string) {
  const promise = new Promise<IBackupStatus>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/backup_status`).then(res => res.json())
      .then((res: IBackupStatus) => {
        console.log('getBackupStatus', res)
        resolve(res);
      })
      .catch((err: any) => {
        console.log('getBackupStatus', err.toString());
        reject(err);
      });
  });
  return promise;
}

export async function stopBackup(reqIp: string) {
  const promise = new Promise<IReturnStatus>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/backup_stop`).then(res => res.json())
      .then((res: IReturnStatus) => {
        resolve(res);
      })
      .catch((err: any) => {
        console.log('stopBackup', err.toString());
        reject(err);
      });
  });
  return promise;
}

export async function verifyAndDelete(reqIp: string) {
  const promise = new Promise<IReturnStatus>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/verify_and_delete`).then(res => res.json())
      .then((res: IReturnStatus) => {
        console.log('verifyAndDelete', res)
        resolve(res);
      })
      .catch((err: any) => {
        console.log('verifyAndDelete', err.toString());
        reject(err);
      });
  });
  return promise;
}

export async function forceDelete(reqIp: string) {
  const promise = new Promise<IReturnStatus>((resolve, reject) => {
    fetch(`http://${reqIp}:5000/api/force_delete`).then(res => res.json())
      .then((res: IReturnStatus) => {
        console.log('forceDelete', res)
        resolve(res);
      })
      .catch((err: any) => {
        console.log('forceDelete', err.toString());
        reject(err);
      });
  });
  return promise;
}