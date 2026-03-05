import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  ActivityIndicator,
} from 'react-native';
import {
  FullScreenViewerShell,
  useZoomPanGesture,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
} from './FullScreenViewerShared';

type FullScreenImageViewerProps = {
  uri: string;
  onClose: () => void;
};

/**
 * Full-screen zoomable image viewer for a captured or loaded image (file:// or content://).
 * Uses the shared zoom/pan gesture hook and shell.
 */
export function FullScreenImageViewer({ uri, onClose }: FullScreenImageViewerProps) {
  const [loaded, setLoaded] = useState(false);
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  rotationRef.current = rotation;

  const widthRef = useRef(SCREEN_WIDTH);
  const heightRef = useRef(SCREEN_HEIGHT);
  widthRef.current = SCREEN_WIDTH;
  heightRef.current = SCREEN_HEIGHT;

  const {
    scaleAnim,
    txAnim,
    tyAnim,
    displayZoom,
    setTransformRef,
    gestureHandlers,
  } = useZoomPanGesture(widthRef, heightRef, rotationRef);

  return (
    <FullScreenViewerShell
      onClose={onClose}
      onFit={() => setTransformRef.current(1, 0, 0)}
      onRotate={() => setRotation((r) => (r + 90) % 360)}
      zoomLabel={`${displayZoom.toFixed(1)}×`}
      loadingOverlay={
        !loaded ? (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { alignItems: 'center', justifyContent: 'center' },
            ]}
          >
            <ActivityIndicator size="large" color="white" />
            <Text style={{ color: '#ccc', marginTop: 10 }}>Loading image…</Text>
          </View>
        ) : undefined
      }
    >
      <View style={{ transform: [{ rotate: `${rotation}deg` }] }}>
        <Animated.View
          style={{
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT,
            transform: [
              { translateX: txAnim },
              { translateY: tyAnim },
              { scale: scaleAnim },
            ],
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={gestureHandlers.onResponderGrant}
          onResponderMove={gestureHandlers.onResponderMove}
          onResponderRelease={gestureHandlers.onResponderRelease}
          onResponderTerminate={gestureHandlers.onResponderTerminate}
        >
          <Image
            source={{ uri }}
            style={{
              width: SCREEN_WIDTH,
              height: SCREEN_HEIGHT,
              resizeMode: 'contain',
              opacity: loaded ? 1 : 0,
            }}
            onLoad={() => setLoaded(true)}
          />
        </Animated.View>
      </View>
    </FullScreenViewerShell>
  );
}
