import { Platform } from 'react-native';
import Geolocation, { GeoPosition, GeoError } from 'react-native-geolocation-service';
import RNBlobUtil from 'react-native-blob-util';
import VIForegroundService from '@voximplant/react-native-foreground-service';

const TRICAPP_DIR = '/storage/emulated/0/Download/Tricapp';
const GPS_INTERVAL_MS = 1000;
const GPS_CHANNEL_ID = 'tricapp_gps_logging';
const GPS_NOTIFICATION_ID = 4001;

let watchId: number | null = null;
let logFilePath: string | null = null;
let headerWritten = false;
let positionReceivedCb: (() => void) | null = null;
let foregroundServiceStarted = false;
let notificationChannelCreated = false;

export const setPositionReceivedCallback = (cb: (() => void) | null): void => {
  positionReceivedCb = cb;
};

const pad = (n: number, width = 2) => n.toString().padStart(width, '0');

const formatSessionTimestamp = (date: Date): string => {
  return (
    `${date.getFullYear()}` +
    `${pad(date.getMonth() + 1)}` +
    `${pad(date.getDate())}` +
    `_${pad(date.getHours())}` +
    `${pad(date.getMinutes())}` +
    `${pad(date.getSeconds())}`
  );
};

const positionToCsvRow = (pos: GeoPosition): string => {
  const { latitude, longitude, altitude, accuracy } = pos.coords;

  const latAbs = Math.abs(latitude);
  const lonAbs = Math.abs(longitude);
  const ns = latitude >= 0 ? 'N' : 'S';
  const ew = longitude >= 0 ? 'E' : 'W';

  const quality = 1;
  const gpsTimestamp = pos.timestamp.toString();
  const alt = altitude != null ? altitude.toFixed(3) : '0.000';
  // accuracy is horizontal accuracy in metres; closest available equivalent to HDOP
  const hdop = accuracy != null ? accuracy.toFixed(2) : '';
  // Geoidal separation is not exposed by the standard Geolocation API
  const separation = '';

  return `${quality},${gpsTimestamp},${latAbs.toFixed(7)},${ns},${lonAbs.toFixed(7)},${ew},${alt},${hdop},${separation}\n`;
};

const ensureDir = async (dir: string) => {
  const exists = await RNBlobUtil.fs.isDir(dir);
  if (!exists) {
    await RNBlobUtil.fs.mkdir(dir);
  }
};

const onPosition = (position: GeoPosition) => {
  positionReceivedCb?.();
  if (!logFilePath || !headerWritten) return;
  const row = positionToCsvRow(position);
  RNBlobUtil.fs.appendFile(logFilePath, row, 'utf8').catch((e) => {
    console.warn('gps_logger: failed to append row', e);
  });
};

const onError = (error: GeoError) => {
  console.warn('gps_logger: position error', error.code, error.message);
};

// Start the continuous position watch — call once on app open.
export const startGpsWatch = (): void => {
  if (watchId !== null) return;
  watchId = Geolocation.watchPosition(onPosition, onError, {
    accuracy: { android: 'high' },
    interval: GPS_INTERVAL_MS,
    fastestInterval: GPS_INTERVAL_MS,
    distanceFilter: 0,
    forceRequestLocation: true,
    showLocationDialog: true,
  });
  console.log('gps_logger: watch started');
};

// Stop the position watch — call on app close / unmount.
export const stopGpsWatch = (): void => {
  if (watchId !== null) {
    Geolocation.clearWatch(watchId);
    watchId = null;
    logFilePath = null;
    headerWritten = false;
    positionReceivedCb = null;
    console.log('gps_logger: watch stopped');
  }
};

const startForegroundServiceIfNeeded = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  const service = VIForegroundService.getInstance();
  try {
    if (!notificationChannelCreated) {
      await service.createNotificationChannel({
        id: GPS_CHANNEL_ID,
        name: 'TricApp GPS',
        description: 'GPS logging during capture (continues when app is in background)',
        enableVibration: false,
      });
      notificationChannelCreated = true;
    }
    await service.startService({
      channelId: GPS_CHANNEL_ID,
      id: GPS_NOTIFICATION_ID,
      title: 'TricApp',
      text: 'GPS logging in progress',
      icon: 'ic_notification',
    });
    foregroundServiceStarted = true;
    return true;
  } catch (e) {
    console.warn('gps_logger: failed to start foreground service', e);
    return false;
  }
};

const stopForegroundServiceIfNeeded = (): void => {
  if (Platform.OS !== 'android' || !foregroundServiceStarted) return;
  try {
    VIForegroundService.getInstance().stopService();
    foregroundServiceStarted = false;
  } catch (e) {
    console.warn('gps_logger: failed to stop foreground service', e);
  }
};

// Open the CSV file and start writing rows — call when capture begins.
export const startGpsLogging = async (sessionStart: Date): Promise<void> => {
  const serviceOk = await startForegroundServiceIfNeeded();
  if (Platform.OS === 'android' && !serviceOk) {
    console.warn('gps_logger: cannot log without foreground service (background location)');
    return;
  }

  try {
    await ensureDir(TRICAPP_DIR);
  } catch (e) {
    console.warn('gps_logger: failed to create directory', e);
    if (foregroundServiceStarted) stopForegroundServiceIfNeeded();
    return;
  }

  const filename = `gps_${formatSessionTimestamp(sessionStart)}.csv`;
  const path = `${TRICAPP_DIR}/${filename}`;
  const header = 'quality,gps_timestamp,latitude,N_S,longitude,E_W,altitude,hdop,separation\n';

  try {
    await RNBlobUtil.fs.writeFile(path, header, 'utf8');
    logFilePath = path;
    headerWritten = true;
    console.log(`gps_logger: logging started, file: ${logFilePath}`);
  } catch (e) {
    console.warn('gps_logger: failed to write CSV header', e);
    if (foregroundServiceStarted) stopForegroundServiceIfNeeded();
  }
};

// Close the CSV file — call when capture ends. Watch keeps running.
export const stopGpsLogging = (): void => {
  if (logFilePath !== null) {
    console.log(`gps_logger: logging stopped, file saved: ${logFilePath}`);
    logFilePath = null;
    headerWritten = false;
  }
  stopForegroundServiceIfNeeded();
};
