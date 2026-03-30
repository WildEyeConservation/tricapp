import { NativeModules, Platform } from 'react-native';

type RawImageProcessorNativeModule = {
  convertArwToPng(filePath: string): Promise<string>;
};

const nativeModule: RawImageProcessorNativeModule | undefined =
  NativeModules.RawImageProcessor;

const RawImageProcessor = {
  async convertArwToPng(filePath: string): Promise<string> {
    if (Platform.OS !== 'android') {
      throw new Error('Raw conversion is currently implemented for Android only.');
    }
    if (!nativeModule?.convertArwToPng) {
      throw new Error('RawImageProcessor native module is not registered.');
    }
    return nativeModule.convertArwToPng(filePath);
  },
};

export default RawImageProcessor;
