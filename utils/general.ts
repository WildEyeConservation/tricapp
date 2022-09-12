import { Platform } from 'react-native';

export const getVersion = (): number => {
  console.log(Platform.Version);
  if (typeof Platform.Version === 'number') {
    return Platform.Version;
  }
  return parseInt(Platform.Version, 10);
}

export const wait = (timeout: number) => {
  return new Promise(resolve => setTimeout(resolve, timeout));
}

export const timeAsHHMM = (seconds: number) => {
  const str = new Date(seconds * 1000).toISOString().substr(11, 5);
  return str.slice(0, 2) + 'h' + str.slice(2, 5) + 'm';
}