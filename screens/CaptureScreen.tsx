import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconCom from 'react-native-vector-icons/MaterialCommunityIcons';
import Toast from 'react-native-simple-toast';
import DocumentPicker from 'react-native-document-picker';
import { WebView } from 'react-native-webview';

import { RootState } from '../store/types';
import { IGpioCamera } from '../network/api_types';
import { getStatus, getImageCount, captureImage, getPreviewStreamUrl } from '../network/api';
import { CaptureProps } from '../navigation/types';
import RawImageProcessor from '../native/RawImageProcessor';
import {
  FullScreenImageViewer,
  FullScreenStreamViewer,
  getPreviewStreamHtml,
} from './fullScreenViewer';

// Once per app session: show short toast when Live preview is first used
let livePreviewToastShown = false;

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
    elapsedSec < 3
      ? 'Sending capture command'
      : elapsedSec < 10
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

const RawConversionLoader = ({ elapsedSec }: { elapsedSec: number }) => {
  const dots = '.'.repeat((Math.floor(elapsedSec) % 3) + 1);
  const statusText =
    elapsedSec < 3
      ? 'Preparing RAW decode'
      : elapsedSec < 15
      ? 'Decoding and demosaicing\u2026'
      : 'Still converting full-resolution image\u2026';

  return (
    <View style={styles.loaderOverlay}>
      <View style={styles.loaderCard}>
        <ActivityIndicator size="large" color="black" />
        <Text style={[styles.textBold, { marginTop: 14, fontSize: 15 }]}>
          Converting RAW{dots}
        </Text>
        <Text style={[styles.textNormal, { marginTop: 4, marginBottom: 16, textAlign: 'center' }]}>
          {statusText}
        </Text>
        <Text style={[styles.textNormal, { marginBottom: 8, textAlign: 'center', color: '#666' }]}>
          This can take up to ~30 seconds on large files.
        </Text>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFg,
              { width: `${Math.min((elapsedSec / 35) * 100, 95)}%` },
            ]}
          />
        </View>
        <Text style={[styles.textNormal, { marginTop: 6, color: '#666' }]}>{elapsedSec}s</Text>
      </View>
    </View>
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
  const [rawConverting, setRawConverting] = useState(false);
  const [rawConversionElapsedSec, setRawConversionElapsedSec] = useState(0);
  const rawConversionElapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Full displayable URI — either file:// (from capture) or content:// (from picker)
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  // Full-screen live preview (stream URL when open)
  const [previewFullScreenUrl, setPreviewFullScreenUrl] = useState<string | null>(null);
  const selectedDevice = selectedDeviceIdx !== null ? devices[selectedDeviceIdx] : null;

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

  // Default to first device and first camera when devices are loaded
  useEffect(() => {
    if (devices.length === 0) return;
    if (selectedDeviceIdx === null) {
      setSelectedDeviceIdx(0);
      const first = devices[0];
      if (first?.status?.cams?.length) {
        setSelectedCamIdx(0);
      }
    }
  }, [devices]); // eslint-disable-line react-hooks/exhaustive-deps -- only run when devices list changes

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

  // Short toast once per app session when Live preview is first used
  useEffect(() => {
    if (
      selectedDevice &&
      selectedCamIdx !== null &&
      selectedDevice.status.cams.length > 0 &&
      !livePreviewToastShown
    ) {
      livePreviewToastShown = true;
      Toast.show('Live preview stops after 5 min', Toast.SHORT);
    }
  }, [selectedDevice, selectedCamIdx]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        if (rawConversionElapsedRef.current) clearInterval(rawConversionElapsedRef.current);
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

  const startRawConversionTimer = () => {
    setRawConversionElapsedSec(0);
    if (rawConversionElapsedRef.current) clearInterval(rawConversionElapsedRef.current);
    rawConversionElapsedRef.current = setInterval(
      () => setRawConversionElapsedSec(prev => prev + 1),
      1000,
    );
  };

  const stopRawConversionTimer = () => {
    if (rawConversionElapsedRef.current) {
      clearInterval(rawConversionElapsedRef.current);
      rawConversionElapsedRef.current = null;
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
      const pickedUri = result.fileCopyUri ?? result.uri;
      const displayName = result.name ?? pickedUri;
      const isArw =
        typeof displayName === 'string' ? /\.arw$/i.test(displayName) : /\.arw$/i.test(pickedUri);

      let finalUri = pickedUri;
      if (isArw) {
        setRawConverting(true);
        startRawConversionTimer();
        try {
          Toast.show('Converting RAW to full-resolution image…', Toast.SHORT);
          finalUri = await RawImageProcessor.convertArwToPng(pickedUri);
        } catch (err: any) {
          Toast.show(
            `RAW conversion failed, using original source: ${err?.message ?? err}`,
            Toast.LONG,
          );
        } finally {
          stopRawConversionTimer();
          setRawConverting(false);
        }
      }

      setDisplayUri(finalUri);
      setViewerOpen(true);
    } catch (e: any) {
      if (!DocumentPicker.isCancel(e)) {
        Toast.show(`Could not open file: ${e?.message ?? e}`, Toast.LONG);
      }
    }
  };

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

        {selectedDevice && <View style={styles.horizontalSpacerWithMargin} />}

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

        {selectedDevice && selectedCamIdx !== null && <View style={styles.horizontalSpacerWithMargin} />}

        {/* ---------- Live preview (when device + camera selected) ---------- */}
        {selectedDevice && selectedCamIdx !== null && selectedDevice.status.cams.length > 0 && (
          <View style={styles.screenView}>
            <TouchableOpacity
              style={{ ...styles.card, padding: 0, overflow: 'hidden' }}
              onPress={() => setPreviewFullScreenUrl(getPreviewStreamUrl(selectedDevice.ip, selectedCamIdx))}
              activeOpacity={1}
            >
              <Text style={[styles.textBold, { padding: 6 }]}>Live preview</Text>
              <View style={styles.previewFrame}>
                <WebView
                  pointerEvents="none"
                  key={`preview-${selectedDevice.ip}-${selectedCamIdx}`}
                  source={{
                    html: getPreviewStreamHtml(
                      getPreviewStreamUrl(selectedDevice.ip, selectedCamIdx),
                    ),
                  }}
                  style={styles.previewImage}
                  scrollEnabled={false}
                  originWhitelist={['*']}
                  mixedContentMode="compatibility"
                  androidLayerType="hardware"
                />
                <View style={styles.thumbOverlay}>
                  <Icon name="zoom-in" size={24} color="white" />
                  <Text style={[styles.textBold, { color: 'white', marginLeft: 6 }]}>
                    Tap to view full image
                  </Text>
                </View>
              </View>
              <Text style={[styles.textNormal, { padding: 4, fontSize: 12, color: '#666' }]}>
                Camera {selectedCamIdx + 1} • {selectedDevice.ip}
              </Text>
            </TouchableOpacity>
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
                disabled={capturing || rawConverting}
                onPress={handleLoadFromFile}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="folder-open" size={28} color={capturing || rawConverting ? '#aaa' : 'black'} />
                  <Text style={[styles.textNormal, { marginLeft: 6, color: capturing || rawConverting ? '#aaa' : 'black' }]}>
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
      {rawConverting && <RawConversionLoader elapsedSec={rawConversionElapsedSec} />}

      {/* ---------- Full-screen image viewer (captured/loaded image) ---------- */}
      {viewerOpen && displayUri && (
        <FullScreenImageViewer uri={displayUri} onClose={() => setViewerOpen(false)} />
      )}

      {/* ---------- Full-screen stream viewer (live preview) ---------- */}
      {previewFullScreenUrl && (
        <FullScreenStreamViewer
          streamUrl={previewFullScreenUrl}
          onClose={() => setPreviewFullScreenUrl(null)}
        />
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
  previewFrame: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
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
});

export default CaptureScreen;
