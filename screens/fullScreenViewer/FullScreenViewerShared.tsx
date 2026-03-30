import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  StatusBar,
  Animated,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import type { MutableRefObject } from 'react';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Current window size; use when viewer must match device orientation (e.g. stream in portrait). */
export function useWindowDimensions() {
  const [dims, setDims] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);
  return dims;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const MIN_Z = 1;
export const MAX_Z = 500;

// ---------------------------------------------------------------------------
// Preview stream HTML (used by inline preview and full-screen stream viewer)
// ---------------------------------------------------------------------------
export function getPreviewStreamHtml(streamUrl: string): string {
  const escaped = streamUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `
<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#111;display:flex;justify-content:center;align-items:center;min-height:100vh;box-sizing:border-box;">
<img src="${escaped}" style="width:100%;height:auto;max-height:100vh;display:block;object-fit:contain;" alt="Live preview" />
</body></html>`;
}

// ---------------------------------------------------------------------------
// Full-screen viewer shell (fit, rotate, close, zoom level, hint)
// ---------------------------------------------------------------------------
export type FullScreenViewerShellProps = {
  onClose: () => void;
  onFit: () => void;
  onRotate: () => void;
  children: React.ReactNode;
  loadingOverlay?: React.ReactNode;
};

export const FullScreenViewerShell = ({
  onClose,
  onFit,
  onRotate,
  children,
  loadingOverlay,
}: FullScreenViewerShellProps) => {
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <View style={[viewerStyles.container, { width, height }]}>
        {children}
        {loadingOverlay}
      <TouchableOpacity style={viewerStyles.fitToScreen} onPress={onFit}>
        <Icon name="fullscreen" size={26} color="white" />
      </TouchableOpacity>
      <TouchableOpacity style={viewerStyles.rotate} onPress={onRotate}>
        <Icon name="rotate-right" size={26} color="white" />
      </TouchableOpacity>
      <TouchableOpacity style={viewerStyles.close} onPress={onClose}>
        <Icon name="close" size={26} color="white" />
      </TouchableOpacity>
      <View style={viewerStyles.hintWrap} pointerEvents="none">
        <Text style={viewerStyles.hint}>Pinch or double-tap to zoom</Text>
      </View>
    </View>
  </Modal>
  );
};

// ---------------------------------------------------------------------------
// Zoom/pan gesture hook
//
// Uses the raw React Native responder API. Transform model: translate(tx, ty)
// applied AFTER scale, both around center. Focal-point-preserving pinch zoom.
// ---------------------------------------------------------------------------
export type ZoomPanGestureHandlers = {
  onResponderGrant: (e: any) => void;
  onResponderMove: (e: any) => void;
  onResponderRelease: (e: any) => void;
  onResponderTerminate: () => void;
};

export function useZoomPanGesture(
  widthRef: MutableRefObject<number>,
  heightRef: MutableRefObject<number>,
  rotationRef?: MutableRefObject<number>,
  /** Minimum allowed scale (e.g. fitScale for image viewer). Defaults to MIN_Z. */
  minZoomRef?: MutableRefObject<number>,
  /** Scale to animate to on double-tap zoom-in. Defaults to 3. */
  doubleTapZoomRef?: MutableRefObject<number>,
): {
  scaleAnim: Animated.Value;
  txAnim: Animated.Value;
  tyAnim: Animated.Value;
  setTransformRef: MutableRefObject<(scale: number, tx: number, ty: number) => void>;
  animateToRef: MutableRefObject<(scale: number, tx: number, ty: number) => void>;
  gestureHandlers: ZoomPanGestureHandlers;
} {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const txAnim = useRef(new Animated.Value(0)).current;
  const tyAnim = useRef(new Animated.Value(0)).current;

  const g = useRef({
    scale: 1,
    tx: 0,
    ty: 0,
    pinchActive: false,
    pinchInitDist: 1,
    pinchInitScale: 1,
    pinchFocalX: 0,
    pinchFocalY: 0,
    pinchInitTx: 0,
    pinchInitTy: 0,
    panActive: false,
    panStartX: 0,
    panStartY: 0,
    panInitTx: 0,
    panInitTy: 0,
    dtLastTime: 0,
  }).current;

  const setTransformRef = useRef<(s: number, x: number, y: number) => void>(() => {});
  const animateToRef = useRef<(s: number, x: number, y: number) => void>(() => {});

  setTransformRef.current = (scale: number, tx: number, ty: number) => {
    g.scale = scale;
    g.tx = tx;
    g.ty = ty;
    scaleAnim.setValue(scale);
    txAnim.setValue(tx);
    tyAnim.setValue(ty);
  };

  animateToRef.current = (scale: number, tx: number, ty: number) => {
    g.scale = scale;
    g.tx = tx;
    g.ty = ty;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: scale,
        useNativeDriver: false,
        friction: 7,
        tension: 40,
      }),
      Animated.spring(txAnim, {
        toValue: tx,
        useNativeDriver: false,
        friction: 7,
        tension: 40,
      }),
      Animated.spring(tyAnim, {
        toValue: ty,
        useNativeDriver: false,
        friction: 7,
        tension: 40,
      }),
    ]).start();
  };

  const onGrant = useRef((e: any) => {
    const t = e.nativeEvent.touches;
    const W = widthRef.current;
    const H = heightRef.current;
    if (t.length >= 2) {
      const dx = t[0].pageX - t[1].pageX;
      const dy = t[0].pageY - t[1].pageY;
      g.pinchActive = true;
      g.panActive = false;
      g.pinchInitDist = Math.sqrt(dx * dx + dy * dy) || 1;
      g.pinchInitScale = g.scale;
      g.pinchFocalX = (t[0].pageX + t[1].pageX) / 2;
      g.pinchFocalY = (t[0].pageY + t[1].pageY) / 2;
      g.pinchInitTx = g.tx;
      g.pinchInitTy = g.ty;
    } else {
      g.pinchActive = false;
      g.panActive = true;
      g.panStartX = t[0]?.pageX ?? W / 2;
      g.panStartY = t[0]?.pageY ?? H / 2;
      g.panInitTx = g.tx;
      g.panInitTy = g.ty;
      const now = Date.now();
      if (now - g.dtLastTime < 280) {
        g.dtLastTime = 0;
        const tapX = t[0]?.pageX ?? W / 2;
        const tapY = t[0]?.pageY ?? H / 2;
        const minZ = minZoomRef?.current ?? MIN_Z;
        if (g.scale > minZ * 1.05) {
          animateToRef.current(minZ, 0, 0);
        } else {
          const tz = doubleTapZoomRef?.current ?? 3,
            z0 = g.scale,
            tx0 = g.tx,
            ty0 = g.ty;
          animateToRef.current(
            tz,
            (tapX - W / 2) * (1 - tz / z0) + tx0 * (tz / z0),
            (tapY - H / 2) * (1 - tz / z0) + ty0 * (tz / z0),
          );
        }
      } else {
        g.dtLastTime = now;
      }
    }
  }).current;

  const onMove = useRef((e: any) => {
    const t = e.nativeEvent.touches;
    const W = widthRef.current;
    const H = heightRef.current;
    const r = rotationRef?.current ?? 0;

    if (t.length >= 2) {
      if (!g.pinchActive) {
        const dx = t[0].pageX - t[1].pageX;
        const dy = t[0].pageY - t[1].pageY;
        g.pinchActive = true;
        g.panActive = false;
        g.pinchInitDist = Math.sqrt(dx * dx + dy * dy) || 1;
        g.pinchInitScale = g.scale;
        g.pinchFocalX = (t[0].pageX + t[1].pageX) / 2;
        g.pinchFocalY = (t[0].pageY + t[1].pageY) / 2;
        g.pinchInitTx = g.tx;
        g.pinchInitTy = g.ty;
      }
      const dx = t[0].pageX - t[1].pageX;
      const dy = t[0].pageY - t[1].pageY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const newScale = Math.min(
        Math.max(g.pinchInitScale * (dist / g.pinchInitDist), minZoomRef?.current ?? MIN_Z),
        MAX_Z,
      );
      const rScale = newScale / g.pinchInitScale;
      const fx = g.pinchFocalX,
        fy = g.pinchFocalY;
      const tx0 = g.pinchInitTx,
        ty0 = g.pinchInitTy;
      setTransformRef.current(
        newScale,
        (fx - W / 2) * (1 - rScale) + tx0 * rScale,
        (fy - H / 2) * (1 - rScale) + ty0 * rScale,
      );
    } else if (t.length === 1 && g.panActive && !g.pinchActive) {
      const dx = t[0].pageX - g.panStartX;
      const dy = t[0].pageY - g.panStartY;
      const cdx = r === 0 ? dx : r === 90 ? dy : r === 180 ? -dx : -dy;
      const cdy = r === 0 ? dy : r === 90 ? -dx : r === 180 ? -dy : dx;
      setTransformRef.current(g.scale, g.panInitTx + cdx, g.panInitTy + cdy);
    }
  }).current;

  const onRelease = useRef((e: any) => {
    const remaining = e.nativeEvent.touches;
    if (remaining.length >= 2) return;
    if (remaining.length === 1 && g.pinchActive) {
      g.pinchActive = false;
      g.panActive = true;
      g.panStartX = remaining[0].pageX;
      g.panStartY = remaining[0].pageY;
      g.panInitTx = g.tx;
      g.panInitTy = g.ty;
      return;
    }
    g.pinchActive = false;
    g.panActive = false;
    const minZ = minZoomRef?.current ?? MIN_Z;
    if (g.scale < minZ) setTransformRef.current(minZ, 0, 0);
  }).current;

  const onTerminate = useRef(() => {
    g.pinchActive = false;
    g.panActive = false;
  }).current;

  return {
    scaleAnim,
    txAnim,
    tyAnim,
    setTransformRef,
    animateToRef,
    gestureHandlers: {
      onResponderGrant: onGrant,
      onResponderMove: onMove,
      onResponderRelease: onRelease,
      onResponderTerminate: onTerminate,
    },
  };
}

// ---------------------------------------------------------------------------
// Shared viewer styles
// ---------------------------------------------------------------------------
export const viewerStyles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streamViewerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fitToScreen: {
    position: 'absolute',
    top: 44,
    left: 16,
    zIndex: 10,
    padding: 6,
  },
  rotate: {
    position: 'absolute',
    top: 44,
    left: 56,
    zIndex: 10,
    padding: 6,
  },
  close: {
    position: 'absolute',
    top: 44,
    right: 16,
    zIndex: 10,
    padding: 6,
  },
  hintWrap: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  hint: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
});

export { SCREEN_WIDTH, SCREEN_HEIGHT };
