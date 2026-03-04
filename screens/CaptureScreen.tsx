import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Image,
  Modal,
  StatusBar,
  Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconCom from 'react-native-vector-icons/MaterialCommunityIcons';
import Toast from 'react-native-simple-toast';
import DocumentPicker from 'react-native-document-picker';

import { RootState } from '../store/types';
import { IGpioCamera } from '../network/api_types';
import { getStatus, getImageCount, captureImage } from '../network/api';
import { CaptureProps } from '../navigation/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const renderDeviceRow = (
  item: IGpioCamera,
  key: string,
  selected: boolean,
  onSelect: () => void,
) => (
  <TouchableOpacity
    key={key}
    style={{ flexDirection: 'row', padding: 5, minHeight: 32, alignItems: 'center' }}
    onPress={onSelect}
  >
    <View style={{ flex: 5, alignItems: 'center' }}>
      <Text style={selected ? styles.textBold : styles.textNormal}>{item.ip}</Text>
    </View>
    <View style={{ flex: 3, alignItems: 'center' }}>
      <Text style={selected ? styles.textBold : styles.textNormal}>{item.status.cams.length}</Text>
    </View>
    <View style={{ flex: 3, alignItems: 'center' }}>
      <Text style={selected ? styles.textBold : styles.textNormal}>{item.status.mode}</Text>
    </View>
    <View style={{ flex: 1, alignItems: 'center' }}>
      {selected && <Icon name="check" size={20} color="black" />}
    </View>
  </TouchableOpacity>
);

const renderCameraRow = (
  cam: string,
  index: number,
  selected: boolean,
  onSelect: () => void,
) => (
  <TouchableOpacity
    key={index.toString()}
    style={{ flexDirection: 'row', padding: 5, minHeight: 32, alignItems: 'center' }}
    onPress={onSelect}
  >
    <View style={{ flex: 1, alignItems: 'center' }}>
      <IconCom name="camera" size={22} color="black" />
    </View>
    <View style={{ flex: 5, alignItems: 'center' }}>
      <Text style={selected ? styles.textBold : styles.textNormal}>
        Camera {index + 1}
      </Text>
    </View>
    <View style={{ flex: 1, alignItems: 'center' }}>
      {selected && <Icon name="check" size={20} color="black" />}
    </View>
  </TouchableOpacity>
);

// ---------------------------------------------------------------------------
// Loading overlay
// ---------------------------------------------------------------------------
const CaptureLoader = ({ elapsedSec }: { elapsedSec: number }) => {
  const dots = '.'.repeat((Math.floor(elapsedSec) % 3) + 1);
  const statusText =
    elapsedSec < 5
      ? 'Sending capture command'
      : elapsedSec < 15
      ? 'Processing\u2026'
      : 'Downloading image data\u2026';

  return (
    <View style={styles.loaderOverlay}>
      <View style={styles.loaderCard}>
        <ActivityIndicator size="large" color="black" />
        <Text style={[styles.textBold, { marginTop: 14, fontSize: 15 }]}>
          Capturing image{dots}
        </Text>
        <Text style={[styles.textNormal, { marginTop: 4, marginBottom: 16, textAlign: 'center' }]}>
          {statusText}
        </Text>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFg,
              { width: `${Math.min((elapsedSec / 40) * 100, 95)}%` },
            ]}
          />
        </View>
        <Text style={[styles.textNormal, { marginTop: 6, color: '#666' }]}>{elapsedSec}s</Text>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Full-screen zoomable image viewer
//
// Uses the raw React Native responder API instead of PanResponder so that
// e.nativeEvent.touches in onResponderMove is guaranteed to contain ALL
// currently active touches (PanResponder's synthetic layer can lose the
// second touch in some RN versions).
//
// Transform model: translate(tx, ty) applied AFTER scale, both around center.
//   screen_x = W/2 + tx + localX * zoom
//   screen_y = H/2 + ty + localY * zoom
//
// Focal-point-preserving zoom (keeps pinch midpoint fixed on screen):
//   newTx = (fx - W/2) * (1 - newZoom/z0) + tx0 * (newZoom/z0)
//   newTy = (fy - H/2) * (1 - newZoom/z0) + ty0 * (newZoom/z0)
// ---------------------------------------------------------------------------
const ImageViewer = ({ uri, onClose }: { uri: string; onClose: () => void }) => {
  const [loaded, setLoaded] = useState(false);
  const [displayZoom, setDisplayZoom] = useState(1);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const txAnim    = useRef(new Animated.Value(0)).current;
  const tyAnim    = useRef(new Animated.Value(0)).current;

  // All mutable gesture state in one ref — no stale closures.
  const g = useRef({
    scale: 1, tx: 0, ty: 0,
    // pinch
    pinchActive:    false,
    pinchInitDist:  1,
    pinchInitScale: 1,
    pinchFocalX:    0, pinchFocalY: 0,
    pinchInitTx:    0, pinchInitTy: 0,
    // pan — tracked via absolute positions, no reliance on gs.dx/dy
    panActive:  false,
    panStartX:  0, panStartY: 0,
    panInitTx:  0, panInitTy: 0,
    // double-tap
    dtLastTime: 0,
  }).current;

  // These refs let the responder callbacks (created once) always call the
  // latest render's closure for Animated.Value updates.
  const setTransformRef = useRef<(s: number, x: number, y: number) => void>(() => {});
  const animateToRef    = useRef<(s: number, x: number, y: number) => void>(() => {});

  // Reassigned on every render — captures the freshest scaleAnim/txAnim refs.
  setTransformRef.current = (scale: number, tx: number, ty: number) => {
    g.scale = scale; g.tx = tx; g.ty = ty;
    scaleAnim.setValue(scale);
    txAnim.setValue(tx);
    tyAnim.setValue(ty);
    setDisplayZoom(scale);
  };

  animateToRef.current = (scale: number, tx: number, ty: number) => {
    g.scale = scale; g.tx = tx; g.ty = ty;
    setDisplayZoom(scale);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: scale, useNativeDriver: false, friction: 7, tension: 40 }),
      Animated.spring(txAnim,    { toValue: tx,    useNativeDriver: false, friction: 7, tension: 40 }),
      Animated.spring(tyAnim,    { toValue: ty,    useNativeDriver: false, friction: 7, tension: 40 }),
    ]).start();
  };

  const W       = SCREEN_WIDTH;
  const H       = SCREEN_HEIGHT;
  const MIN_Z   = 1;
  const MAX_Z   = 500;

  // ---- responder handlers (created once, access state via `g` ref) --------

  const onGrant = useRef((e: any) => {
    const t = e.nativeEvent.touches;
    if (t.length >= 2) {
      // Both fingers already down when we received the grant (rare but possible).
      const dx = t[0].pageX - t[1].pageX;
      const dy = t[0].pageY - t[1].pageY;
      g.pinchActive    = true;
      g.panActive      = false;
      g.pinchInitDist  = Math.sqrt(dx * dx + dy * dy) || 1;
      g.pinchInitScale = g.scale;
      g.pinchFocalX    = (t[0].pageX + t[1].pageX) / 2;
      g.pinchFocalY    = (t[0].pageY + t[1].pageY) / 2;
      g.pinchInitTx    = g.tx;
      g.pinchInitTy    = g.ty;
    } else {
      // Single finger — pan start + double-tap check.
      g.pinchActive = false;
      g.panActive   = true;
      g.panStartX   = t[0]?.pageX ?? W / 2;
      g.panStartY   = t[0]?.pageY ?? H / 2;
      g.panInitTx   = g.tx;
      g.panInitTy   = g.ty;

      const now = Date.now();
      if (now - g.dtLastTime < 280) {
        g.dtLastTime = 0;
        const tapX = t[0]?.pageX ?? W / 2;
        const tapY = t[0]?.pageY ?? H / 2;
        if (g.scale > 1.05) {
          setTransformRef.current(1, 0, 0);
        } else {
          const tz = 3, z0 = g.scale, tx0 = g.tx, ty0 = g.ty;
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
    const t = e.nativeEvent.touches;   // ALWAYS all active touches in raw API

    if (t.length >= 2) {
      // ---- pinch ----
      if (!g.pinchActive) {
        // Second finger landed after the initial grant — init pinch now.
        const dx = t[0].pageX - t[1].pageX;
        const dy = t[0].pageY - t[1].pageY;
        g.pinchActive    = true;
        g.panActive      = false;
        g.pinchInitDist  = Math.sqrt(dx * dx + dy * dy) || 1;
        g.pinchInitScale = g.scale;
        g.pinchFocalX    = (t[0].pageX + t[1].pageX) / 2;
        g.pinchFocalY    = (t[0].pageY + t[1].pageY) / 2;
        g.pinchInitTx    = g.tx;
        g.pinchInitTy    = g.ty;
      }

      const dx   = t[0].pageX - t[1].pageX;
      const dy   = t[0].pageY - t[1].pageY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const newScale = Math.min(
        Math.max(g.pinchInitScale * (dist / g.pinchInitDist), MIN_Z),
        MAX_Z,
      );

      const r   = newScale / g.pinchInitScale;
      const fx  = g.pinchFocalX, fy  = g.pinchFocalY;
      const tx0 = g.pinchInitTx, ty0 = g.pinchInitTy;

      setTransformRef.current(
        newScale,
        (fx - W / 2) * (1 - r) + tx0 * r,
        (fy - H / 2) * (1 - r) + ty0 * r,
      );
    } else if (t.length === 1 && g.panActive && !g.pinchActive) {
      // ---- pan (absolute delta, not PanResponder's gs.dx) ----
      setTransformRef.current(
        g.scale,
        g.panInitTx + (t[0].pageX - g.panStartX),
        g.panInitTy + (t[0].pageY - g.panStartY),
      );
    }
  }).current;

  const onRelease = useRef((e: any) => {
    const remaining = e.nativeEvent.touches;
    if (remaining.length >= 2) {
      // Still multiple fingers — shouldn't normally happen but handle gracefully.
      return;
    }
    if (remaining.length === 1 && g.pinchActive) {
      // One finger lifted from a pinch — switch the remaining finger to pan.
      g.pinchActive = false;
      g.panActive   = true;
      g.panStartX   = remaining[0].pageX;
      g.panStartY   = remaining[0].pageY;
      g.panInitTx   = g.tx;
      g.panInitTy   = g.ty;
      return;
    }
    // All fingers up.
    g.pinchActive = false;
    g.panActive   = false;
    if (g.scale < MIN_Z) {
      setTransformRef.current(MIN_Z, 0, 0);
    }
  }).current;

  const onTerminate = useRef(() => {
    g.pinchActive = false;
    g.panActive   = false;
  }).current;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <View style={styles.viewerContainer}>

        <Animated.View
          style={{
            width: W,
            height: H,
            transform: [
              { translateX: txAnim },
              { translateY: tyAnim },
              { scale: scaleAnim },
            ],
          }}
          // Raw responder API — onResponderMove always has ALL active touches.
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={onGrant}
          onResponderMove={onMove}
          onResponderRelease={onRelease}
          onResponderTerminate={onTerminate}
        >
          <Image
            source={{ uri }}
            style={{
              width: W,
              height: H,
              resizeMode: 'contain',
              opacity: loaded ? 1 : 0,
            }}
            onLoad={() => setLoaded(true)}
          />
        </Animated.View>

        {!loaded && (
          <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="white" />
            <Text style={{ color: '#ccc', marginTop: 10 }}>Loading image\u2026</Text>
          </View>
        )}

        <View style={styles.viewerZoomLevelWrap} pointerEvents="none">
          <Text style={styles.viewerZoomLevel}>{displayZoom.toFixed(1)}×</Text>
        </View>

        <TouchableOpacity
          style={styles.viewerFitToScreen}
          onPress={() => setTransformRef.current(1, 0, 0)}
        >
          <Icon name="fullscreen" size={26} color="white" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.viewerClose} onPress={onClose}>
          <Icon name="close" size={26} color="white" />
        </TouchableOpacity>

        <View style={styles.viewerHintWrap} pointerEvents="none">
          <Text style={styles.viewerHint}>Pinch or double-tap to zoom</Text>
        </View>

      </View>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
const CaptureScreen = ({ route, navigation }: CaptureProps) => {
  const ips = useSelector((state: RootState) => state.wifi.ips);

  const [devices, setDevices] = useState<IGpioCamera[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [selectedDeviceIdx, setSelectedDeviceIdx] = useState<number | null>(null);
  const [selectedCamIdx, setSelectedCamIdx] = useState<number | null>(null);

  const [capturing, setCapturing] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Full displayable URI — either file:// (from capture) or content:// (from picker)
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    const result: IGpioCamera[] = [];
    for (const ip of ips) {
      try {
        const status = await getStatus(ip);
        const imageCount = await getImageCount(ip);
        result.push({ ip, status, imageCount });
      } catch {
        result.push({
          ip,
          status: {
            mode: 'OFFLINE',
            cams: [],
            camError: false,
            gps: { fix: false, satellites: 0, pdop: 0, max: 0, min: 0, avg: 0, lastUpdate: 0 },
            wifiSignal: 0,
          },
          imageCount: { imageCount: [], copyCount: [] },
        });
      }
    }
    setDevices(result);
    setLoadingDevices(false);
  }, [ips]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            if (!loadingDevices) {
              Toast.show('Refreshing…');
              fetchDevices();
            }
          }}
          disabled={loadingDevices}
        >
          {loadingDevices ? (
            <ActivityIndicator size="small" color="black" />
          ) : (
            <Icon name="refresh" size={30} color="black" />
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, loadingDevices, fetchDevices]);

  useEffect(() => {
    fetchDevices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run detect devices once on mount

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
      };
    }, []),
  );

  const startElapsedTimer = () => {
    setElapsedSec(0);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => setElapsedSec(prev => prev + 1), 1000);
  };

  const stopElapsedTimer = () => {
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  };

  const handleCapture = async () => {
    if (selectedDeviceIdx === null || selectedCamIdx === null) return;
    const device = devices[selectedDeviceIdx];
    setCapturing(true);
    startElapsedTimer();
    try {
      const path = await captureImage(device.ip, selectedCamIdx);
      stopElapsedTimer();
      setCapturing(false);
      setDisplayUri(`file://${path}`);
      setViewerOpen(true);
    } catch (e: any) {
      stopElapsedTimer();
      setCapturing(false);
      Toast.show(`Capture failed: ${e?.message ?? e}`, Toast.LONG);
    }
  };

  const handleLoadFromFile = async () => {
    try {
      const [result] = await DocumentPicker.pick({
        type: [DocumentPicker.types.images, DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
      });
      const uri = result.fileCopyUri ?? result.uri;
      setDisplayUri(uri);
      setViewerOpen(true);
    } catch (e: any) {
      if (!DocumentPicker.isCancel(e)) {
        Toast.show(`Could not open file: ${e?.message ?? e}`, Toast.LONG);
      }
    }
  };

  const selectedDevice = selectedDeviceIdx !== null ? devices[selectedDeviceIdx] : null;
  const canCapture =
    selectedDeviceIdx !== null &&
    selectedCamIdx !== null &&
    selectedDevice?.status.mode !== 'OFFLINE' &&
    !capturing;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView style={{ width: '100%' }} contentContainerStyle={{ padding: 2 }}>

        {/* ---------- Device list ---------- */}
        <View style={styles.screenView}>
          {devices.length === 0 ? (
            <View style={{ ...styles.card, alignItems: 'center', padding: 12 }}>
              <Text style={styles.textNormal}>No devices found. Check your network settings.</Text>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', padding: 5 }}>
                {['Device', 'Cameras', 'Status', ''].map((item, index) => (
                  <View
                    key={index.toString()}
                    style={{ flex: [5, 3, 3, 1][index], alignItems: 'center' }}
                  >
                    <Text style={styles.textBold}>{item}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.horizontalSpacer} />
              {devices.map((item, index) =>
                renderDeviceRow(item, index.toString(), selectedDeviceIdx === index, () => {
                  setSelectedDeviceIdx(index);
                  setSelectedCamIdx(null);
                }),
              )}
            </View>
          )}
        </View>

        <View style={styles.horizontalSpacerWithMargin} />

        {/* ---------- Camera list ---------- */}
        {selectedDevice && (
          <View style={styles.screenView}>
            <View style={styles.card}>
              {selectedDevice.status.cams.length === 0 ? (
                <View style={{ padding: 10, alignItems: 'center' }}>
                  <Text style={styles.textNormal}>
                    {selectedDevice.status.mode === 'OFFLINE'
                      ? 'Device is offline.'
                      : 'No cameras detected on this device.'}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', padding: 5 }}>
                    {['', 'Camera', ''].map((item, index) => (
                      <View
                        key={index.toString()}
                        style={{ flex: [1, 5, 1][index], alignItems: 'center' }}
                      >
                        <Text style={styles.textBold}>{item}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.horizontalSpacer} />
                  {selectedDevice.status.cams.map((cam, i) =>
                    renderCameraRow(cam, i, selectedCamIdx === i, () => setSelectedCamIdx(i)),
                  )}
                </>
              )}
            </View>
          </View>
        )}

        <View style={styles.horizontalSpacerWithMargin} />

        {/* ---------- Action buttons ---------- */}
        <View style={styles.screenView}>
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', width: '95%', justifyContent: 'space-evenly' }}>
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center', padding: 10 }}
                disabled={!canCapture}
                onPress={handleCapture}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="camera-alt" size={28} color={canCapture ? 'black' : '#aaa'} />
                  <Text style={[styles.textNormal, { marginLeft: 6, color: canCapture ? 'black' : '#aaa' }]}>
                    Capture
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.verticalSpacer} />
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center', padding: 10 }}
                disabled={capturing}
                onPress={handleLoadFromFile}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="folder-open" size={28} color={capturing ? '#aaa' : 'black'} />
                  <Text style={[styles.textNormal, { marginLeft: 6, color: capturing ? '#aaa' : 'black' }]}>
                    Load file
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ---------- Image thumbnail ---------- */}
        {displayUri && !viewerOpen && (
          <>
            <View style={styles.horizontalSpacerWithMargin} />
            <View style={styles.screenView}>
              <TouchableOpacity
                style={{ ...styles.card, padding: 0, overflow: 'hidden' }}
                onPress={() => setViewerOpen(true)}
              >
                <Image
                  source={{ uri: displayUri }}
                  style={{ width: '100%', height: 200 }}
                  resizeMode="cover"
                />
                <View style={styles.thumbOverlay}>
                  <Icon name="zoom-in" size={24} color="white" />
                  <Text style={[styles.textBold, { color: 'white', marginLeft: 6 }]}>
                    Tap to view full image
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

      </ScrollView>

      {/* ---------- Loading overlay ---------- */}
      {capturing && <CaptureLoader elapsedSec={elapsedSec} />}

      {/* ---------- Full-screen viewer ---------- */}
      {viewerOpen && displayUri && (
        <ImageViewer uri={displayUri} onClose={() => setViewerOpen(false)} />
      )}
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles — intentionally mirrors HomeScreen / SetupScreen
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  screenView: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 2,
    margin: 2,
  },
  horizontalSpacer: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 1,
  },
  horizontalSpacerWithMargin: {
    backgroundColor: '#ccc',
    width: '95%',
    height: 1,
    marginVertical: 2,
    alignSelf: 'center',
  },
  textNormal: {
    color: 'black',
    flexWrap: 'wrap',
  },
  textBold: {
    color: 'black',
    fontWeight: 'bold',
    flexWrap: 'wrap',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
    padding: 4,
    width: '100%',
  },
  verticalSpacer: {
    backgroundColor: '#ccc',
    width: 1,
    marginVertical: 6,
  },
  thumbOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  // --- Loading overlay ---
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  loaderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    padding: 24,
    width: '78%',
    alignItems: 'center',
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFg: {
    height: '100%',
    backgroundColor: 'black',
    borderRadius: 2,
  },
  // --- Image viewer ---
  viewerContainer: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerZoomLevelWrap: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  viewerZoomLevel: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    overflow: 'hidden',
  },
  viewerFitToScreen: {
    position: 'absolute',
    top: 44,
    left: 16,
    zIndex: 10,
    padding: 6,
  },
  viewerClose: {
    position: 'absolute',
    top: 44,
    right: 16,
    zIndex: 10,
    padding: 6,
  },
  viewerHintWrap: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  viewerHint: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
});

export default CaptureScreen;
