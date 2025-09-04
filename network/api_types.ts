export interface ICamera {
  id: string;
  freeMB: number;
  freeGB: number;
  capacityGB: number;
  usedGB: number;
}

export interface IExternal {
  freeGB: number;
  capacityGB: number;
  usedGB: number;
}

export interface IStats {
  cameras: ICamera[];
  external: IExternal;
  battery: number;
  captureInterval: number;
}

export interface ICopyEta {
  percentage: number; // between 0 and 1
  timeRemaining: string;
  exceptions: number[];
  captured: number[];
  copied: number[];
}

export interface IGpsStatus {
  fix: boolean;
  satellites: number;
  pdop: number;
  max: number;
  min: number;
  avg: number;
  lastUpdate: number;
}

export interface IStatus {
  mode: string;
  cams: string[];
  camError: boolean;
  progress?: ICopyEta;
  gps: IGpsStatus;
  wifiSignal: number;
}

export interface ILensNumber {
  lens: string;
}

export interface IReturnStatus {
  success: boolean;
}

interface IExifSessionInfo {
  FileName: string;
  FileDir: string;
  SubSecDateTimeOriginal: string;
  ExifImageHeight: number;
  ExifImageWidth: number;
  GPSAltitude: string;
  GPSDateStamp: number;
  GPSLatitude: number;
  GPSLongitude: number;
  GPSLatitudeDir: string;
  GPSLongitudeDir: string;
  GPSQuality: number;
  AccX: number;
  AccY: number;
  AccZ: number;
  ISO: number;
  ShutterSpeedValue: string;
  FocusMode: string;
  Quality: string;
  md5: string;
}

interface IExifCamSession {
  serialNumber: string;
  exifInfo: IExifSessionInfo[];
  sessionId: string;
  lensSerialNumber: string;
}

export interface IExifSession {
  sessionId: string;
  sessionInfo: IExifCamSession[];
}

export interface IExifSessions {
  sessions: IExifSession[];
}

export interface IExifSessionIds {
  sessionIds: string[];
}

export interface IImageCount {
  imageCount: number[];
}

export interface IGpioCamera {
  ip: string;
  status: IStatus;
  imageCount: IImageCount;
}

export interface IGpioCameraSettings {
  ip: string;
  captureInterval: number;
}

export interface IBackupStatus {
  running: boolean;
  phase: "idle" | "copying" | "stopping" | "finished" | "error";
  message: string;
  /** 0..100 (two decimals from server) */
  percent: number;
  bytes_done: number;
  bytes_total: number;
  files_done: number;
  files_total: number;
  eta_seconds: number | null;
}