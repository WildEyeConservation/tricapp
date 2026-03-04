import React from 'react';
import { StackScreenProps } from '@react-navigation/stack';

export type RootStackParamList = {
  HomeStack: undefined;
  ImagesStack: undefined;
  AboutStack: undefined;
  SetupStack: undefined;
  CaptureStack: undefined;
};

export type HomeProps = StackScreenProps<RootStackParamList, 'HomeStack'>;
export type ImagesProps = StackScreenProps<RootStackParamList, 'ImagesStack'>;
export type AboutProps = StackScreenProps<RootStackParamList, 'AboutStack'>;
export type SetupProps = StackScreenProps<RootStackParamList, 'SetupStack'>;
export type CaptureProps = StackScreenProps<RootStackParamList, 'CaptureStack'>;