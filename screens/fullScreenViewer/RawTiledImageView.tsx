import React from 'react';
import { requireNativeComponent, ViewStyle } from 'react-native';

type RawTiledImageViewProps = {
  uri: string;
  fitToViewToken?: number;
  style?: ViewStyle;
};

const NativeRawTiledImageView = requireNativeComponent<RawTiledImageViewProps>('RawTiledImageView');

export function RawTiledImageView({ uri, fitToViewToken, style }: RawTiledImageViewProps) {
  return <NativeRawTiledImageView uri={uri} fitToViewToken={fitToViewToken} style={style} />;
}
