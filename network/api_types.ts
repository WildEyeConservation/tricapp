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

export interface IStatus {
  mode: string;
  cams: string[];
  camError: boolean;
  progress?: ICopyEta;
}

export interface ILensNumber {
  lens: string;
}

export interface IRestart {
  success: boolean;
}
export interface IGpsStatus {
  gps_status_of_cams: string[];
}

interface IExifSessionInfo {
  FileName: string;
  FileDir: string;
  SubSecDateTimeOriginal: string;
  ExifImageHeight: number;
  ExifImageWidth: number;
  GPSAltitude: string;
  GPSDateStamp: string;
  GPSLatitude: string;
  GPSLongitude: string;
  GPSTimeStamp: string;
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