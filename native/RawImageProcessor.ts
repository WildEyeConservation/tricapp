import { NativeModules, Platform } from 'react-native';

type RawImageProcessorNativeModule = {
  convertArwToPng(filePath: string): Promise<RawImageConversionResult>;
  convertArwToFullBmp(filePath: string): Promise<RawImageConversionResult>;
};

export type RawImageConversionResult = {
  stage: 'preview' | 'full';
  uri: string;
  width: number;
  height: number;
};

const nativeModule: RawImageProcessorNativeModule | undefined =
  NativeModules.RawImageProcessor;

const RawImageProcessor = {
  async convertArwToPng(filePath: string): Promise<RawImageConversionResult> {
    if (Platform.OS !== 'android') {
      throw new Error('Raw conversion is currently implemented for Android only.');
    }
    if (!nativeModule?.convertArwToPng) {
      throw new Error('RawImageProcessor native module is not registered.');
    }
    return nativeModule.convertArwToPng(filePath);
  },

  async convertArwToFullBmp(filePath: string): Promise<RawImageConversionResult> {
    if (Platform.OS !== 'android') {
      throw new Error('Raw conversion is currently implemented for Android only.');
    }
    if (!nativeModule?.convertArwToFullBmp) {
      throw new Error('RawImageProcessor full decode method is not registered.');
    }
    return nativeModule.convertArwToFullBmp(filePath);
  },
};

export default RawImageProcessor;
