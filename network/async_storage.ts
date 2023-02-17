import AsyncStorage from '@react-native-async-storage/async-storage';
import _ from 'lodash';

import { IExifSessions, IExifSessionIds, IExifSession } from './api_types';

// For debug purposes 
// AsyncStorage.clear();

export const storeExifSessions = async (newSessions: IExifSessions) => {
  console.log('storeExifSessions', newSessions.sessions.length);
  try {
    const storedSessionIds = await getStoredExifSessionIds();
    console.log('Saved sessions', storedSessionIds?.sessionIds.length);
    if (storedSessionIds !== undefined) {
      // add to old data
      const filteredNewSessions = newSessions.sessions.filter((session) => !storedSessionIds.sessionIds.includes(session.sessionId));
      for (const sess of filteredNewSessions) {
        await AsyncStorage.setItem(`@Tricap:sessions${sess.sessionId}`, JSON.stringify(sess));
      }
      // await AsyncStorage.setItem('@Tricap:sessions', JSON.stringify(storedSessions));
    } else {
      // add all new data
      for (const sess of newSessions.sessions) {
        await AsyncStorage.setItem(`@Tricap:sessions${sess.sessionId}`, JSON.stringify(sess));
      }
    }
  } catch (e) {
    console.log(`Store exif sessions failed ${e}`);
  }
}

export const storeExifSessionIds = async (newSessionIds: IExifSessionIds) => {
  console.log('storeExifSessionIds', newSessionIds.sessionIds.length);
  try {
    const storedSessionIds = await getStoredExifSessionIds();
    console.log('Saved ids', storedSessionIds?.sessionIds.length);
    if (storedSessionIds !== undefined) {
      // add to old data
      const filteredNewSessionIds = newSessionIds.sessionIds.filter((id) => !storedSessionIds.sessionIds.includes(id));
      storedSessionIds.sessionIds = storedSessionIds.sessionIds.concat(filteredNewSessionIds)
      await AsyncStorage.setItem('@Tricap:sessionIds', JSON.stringify(storedSessionIds));
    } else {
      // add new data
      await AsyncStorage.setItem('@Tricap:sessionIds', JSON.stringify(newSessionIds));
    }
  } catch (e) {
    console.log(`Store exif IDs failed ${e}`);
  }
}

export const getStoredExifSession = (sessionId: string) => {
  const promise = new Promise<IExifSession>((resolve, reject) => {
    console.log('getStoredExifSession', sessionId);
    AsyncStorage.getItem(`@Tricap:sessions${sessionId}`)
    .then(sess => {
      if (sess !== null && sess !== '') {
        const storedSess: IExifSession | undefined = JSON.parse(sess);
        if (storedSess) {
          resolve(storedSess);
        } else {
          reject('Cannot parse session from async storage');
        }
      }    
    })
    .catch(e => {
      reject('Cannot read session from async storage');
    });
  });
  return promise;
}

export const getStoredExifSessionIds = async () => {
  try {
    const value = await AsyncStorage.getItem('@Tricap:sessionIds');
    if (value !== null && value !== '') {
      const storedSessionIds: IExifSessionIds | undefined = JSON.parse(value);
      return storedSessionIds;
    }
  } catch (e) {
    console.log(`Read exif info failed ${e}`);
  }
  return undefined;
}

export const getStoredIps = async () => {
  try {
    const value = await AsyncStorage.getItem('@Tricap:ips');
    if (value !== null && value !== '') {
      const storedIps: string[] | undefined = JSON.parse(value);
      return storedIps;
    }
  } catch (e) {
    console.log(`Read ips failed ${e}`);
  }
  return undefined;
}

export const getCaptureInterval = async () => {
  try {
    const value = await AsyncStorage.getItem('@Tricap:captureInterval');
    if (value !== null && value !== '') {
      const storedInterval: string | undefined = value;
      return storedInterval;
    }
  } catch (e) {
    console.log(`Read capture interval failed ${e}`);
  }
  return undefined;
}