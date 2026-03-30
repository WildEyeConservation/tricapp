import React, { useState, useRef } from 'react';
import { View, Animated } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  FullScreenViewerShell,
  useZoomPanGesture,
  getPreviewStreamHtml,
  viewerStyles,
  useWindowDimensions,
} from './FullScreenViewerShared';

type FullScreenStreamViewerProps = {
  streamUrl: string;
  onClose: () => void;
};

/**
 * Full-screen live stream viewer (WebView + zoom/pan, rotate, fit-to-view).
 * Uses current window dimensions so portrait mode shows the full frame (no stale landscape size).
 */
export function FullScreenStreamViewer({ streamUrl, onClose }: FullScreenStreamViewerProps) {
  const [rotation, setRotation] = useState(0);
  const windowSize = useWindowDimensions();
  const rotationRef = useRef(0);
  rotationRef.current = rotation;

  const isSwap = rotation === 90 || rotation === 270;
  const innerW = isSwap ? windowSize.height : windowSize.width;
  const innerH = isSwap ? windowSize.width : windowSize.height;
  const contentWRef = useRef(innerW);
  const contentHRef = useRef(innerH);
  contentWRef.current = innerW;
  contentHRef.current = innerH;

  const {
    scaleAnim,
    txAnim,
    tyAnim,
    setTransformRef,
    gestureHandlers,
  } = useZoomPanGesture(contentWRef, contentHRef, rotationRef);

  return (
    <FullScreenViewerShell
      onClose={onClose}
      onFit={() => setTransformRef.current(1, 0, 0)}
      onRotate={() => setRotation((r) => (r + 90) % 360)}
    >
      <View style={viewerStyles.streamViewerCenter}>
        <View style={{ width: innerW, height: innerH, transform: [{ rotate: `${rotation}deg` }] }}>
          <Animated.View
            style={{
              width: innerW,
              height: innerH,
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
            <WebView
              source={{ html: getPreviewStreamHtml(streamUrl) }}
              style={{ width: innerW, height: innerH }}
              scrollEnabled={false}
              originWhitelist={['*']}
              mixedContentMode="compatibility"
              androidLayerType="hardware"
              pointerEvents="none"
            />
          </Animated.View>
        </View>
      </View>
    </FullScreenViewerShell>
  );
}
