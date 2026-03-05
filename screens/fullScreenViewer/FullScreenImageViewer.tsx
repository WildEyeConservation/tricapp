import React, { useState, useRef, useEffect } from 'react';
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
 *
 * Renders the Image at its natural pixel dimensions so the GPU has full-resolution texture
 * data when zooming. The initial transform scale is set to fitScale (fit-to-screen), and
 * double-tap zooms to 1:1 pixel mapping (one image pixel = one screen pixel).
 */
export function FullScreenImageViewer({ uri, onClose }: FullScreenImageViewerProps) {
  const [loaded, setLoaded] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  const rotationRef = useRef(0);
  rotationRef.current = rotation;

  const widthRef = useRef(SCREEN_WIDTH);
  const heightRef = useRef(SCREEN_HEIGHT);
  widthRef.current = SCREEN_WIDTH;
  heightRef.current = SCREEN_HEIGHT;

  // fitScale: the transform scale at which the full-resolution image fills the screen.
  // minZoom is clamped to fitScale so the user cannot pinch-zoom below fit-to-screen.
  // doubleTapZoom = 1.0 means "1 image pixel = 1 screen pixel" (100% actual pixels).
  const minZoomRef = useRef(1);
  const doubleTapZoomRef = useRef(1);

  const {
    scaleAnim,
    txAnim,
    tyAnim,
    displayZoom,
    setTransformRef,
    gestureHandlers,
  } = useZoomPanGesture(widthRef, heightRef, rotationRef, minZoomRef, doubleTapZoomRef);

  useEffect(() => {
    Image.getSize(
      uri,
      (w, h) => {
        setImageSize({ width: w, height: h });
        const fitScale = Math.min(SCREEN_WIDTH / w, SCREEN_HEIGHT / h);
        minZoomRef.current = fitScale;
        doubleTapZoomRef.current = 1.0; // 1:1 pixel mapping on double-tap
        setTransformRef.current(fitScale, 0, 0);
      },
      () => {
        // Image.getSize failed – fall back to screen-sized rendering (scale stays at 1)
      },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const fitScale = imageSize
    ? Math.min(SCREEN_WIDTH / imageSize.width, SCREEN_HEIGHT / imageSize.height)
    : 1;

  const imgW = imageSize?.width ?? SCREEN_WIDTH;
  const imgH = imageSize?.height ?? SCREEN_HEIGHT;

  // Keep image hidden until both the size is known (so we can set the right initial scale)
  // and the image is actually loaded (to avoid a flash at the wrong scale).
  const imageVisible = loaded && imageSize != null;

  return (
    <FullScreenViewerShell
      onClose={onClose}
      onFit={() => setTransformRef.current(fitScale, 0, 0)}
      onRotate={() => setRotation((r) => (r + 90) % 360)}
      zoomLabel={`${(displayZoom / fitScale).toFixed(1)}×`}
      loadingOverlay={
        !imageVisible ? (
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
            width: imgW,
            height: imgH,
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
              width: imgW,
              height: imgH,
              opacity: imageVisible ? 1 : 0,
            }}
            resizeMethod="scale"
            onLoad={() => setLoaded(true)}
          />
        </Animated.View>
      </View>
    </FullScreenViewerShell>
  );
}
