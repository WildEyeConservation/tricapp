import React from 'react';
import { requireNativeComponent, ViewStyle } from 'react-native';

type RawTiledImageViewProps = {
  uri: string;
  style?: ViewStyle;
};

const NativeRawTiledImageView = requireNativeComponent<RawTiledImageViewProps>('RawTiledImageView');

export function RawTiledImageView({ uri, style }: RawTiledImageViewProps) {
  return <NativeRawTiledImageView uri={uri} style={style} />;
}
