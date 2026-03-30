import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  ActivityIndicator,
  Platform,
} from 'react-native';
import RNBlobUtil from 'react-native-blob-util';
import { Buffer } from 'buffer';
import { RawTiledImageView } from './RawTiledImageView';
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

const JPEG_SOI_A = 0xff;
const JPEG_SOI_B = 0xd8;
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47];
const TIFF_LE_SIG = [0x49, 0x49, 0x2a, 0x00];
const TIFF_BE_SIG = [0x4d, 0x4d, 0x00, 0x2a];
const BMP_SIG = [0x42, 0x4d];
const TAG_IMAGE_WIDTH = 0x0100;
const TAG_IMAGE_HEIGHT = 0x0101;
const TAG_EXIF_IFD = 0x8769;
const TAG_EXIF_WIDTH = 0xa002;
const TAG_EXIF_HEIGHT = 0xa003;
const DIMENSION_PROBE_BYTES = 128 * 1024;

function sanitizeFilePath(uri: string): string | null {
  if (!uri.startsWith('file://')) return null;
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

function readU16(buf: Buffer, offset: number, littleEndian: boolean): number {
  return littleEndian ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
}

function readU32(buf: Buffer, offset: number, littleEndian: boolean): number {
  return littleEndian ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
}

function parseJpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== JPEG_SOI_A || buf[1] !== JPEG_SOI_B) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let marker = buf[offset + 1];
    while (marker === 0xff && offset + 2 < buf.length) {
      offset += 1;
      marker = buf[offset + 1];
    }
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > buf.length) break;
    const segmentLen = buf.readUInt16BE(offset);
    if (segmentLen < 2 || offset + segmentLen > buf.length) break;
    const isSofMarker =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSofMarker && segmentLen >= 7) {
      const height = buf.readUInt16BE(offset + 3);
      const width = buf.readUInt16BE(offset + 5);
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    offset += segmentLen;
  }
  return null;
}

function parsePngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (
    buf[0] !== PNG_SIG[0] ||
    buf[1] !== PNG_SIG[1] ||
    buf[2] !== PNG_SIG[2] ||
    buf[3] !== PNG_SIG[3]
  ) {
    return null;
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width > 0 && height > 0) return { width, height };
  return null;
}

function parseBmpSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 26) return null;
  if (buf[0] !== BMP_SIG[0] || buf[1] !== BMP_SIG[1]) return null;
  const dibSize = buf.readUInt32LE(14);
  if (dibSize < 12) return null;
  if (dibSize >= 40) {
    const width = buf.readInt32LE(18);
    const heightSigned = buf.readInt32LE(22);
    const height = Math.abs(heightSigned);
    if (width > 0 && height > 0) return { width, height };
    return null;
  }
  // BITMAPCOREHEADER (rare)
  const width = buf.readUInt16LE(18);
  const height = buf.readUInt16LE(20);
  if (width > 0 && height > 0) return { width, height };
  return null;
}

function readTiffDimensionValue(
  buf: Buffer,
  valueType: number,
  valueCount: number,
  valueOffsetField: number,
  littleEndian: boolean,
): number | null {
  if (valueCount < 1) return null;
  if (valueType === 3) {
    // SHORT
    return littleEndian ? valueOffsetField & 0xffff : valueOffsetField >>> 16;
  }
  if (valueType === 4) {
    // LONG
    return valueOffsetField >>> 0;
  }
  return null;
}

function parseTiffIfd(
  buf: Buffer,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean,
): { width?: number; height?: number; exifIfdOffset?: number } | null {
  const dirOffset = tiffStart + ifdOffset;
  if (dirOffset + 2 > buf.length) return null;
  const count = readU16(buf, dirOffset, littleEndian);
  let width: number | undefined;
  let height: number | undefined;
  let exifIfdOffset: number | undefined;
  for (let i = 0; i < count; i += 1) {
    const entry = dirOffset + 2 + i * 12;
    if (entry + 12 > buf.length) break;
    const tag = readU16(buf, entry, littleEndian);
    const valueType = readU16(buf, entry + 2, littleEndian);
    const valueCount = readU32(buf, entry + 4, littleEndian);
    const valueOffsetField = readU32(buf, entry + 8, littleEndian);
    if (
      tag === TAG_IMAGE_WIDTH ||
      tag === TAG_IMAGE_HEIGHT ||
      tag === TAG_EXIF_WIDTH ||
      tag === TAG_EXIF_HEIGHT
    ) {
      const v = readTiffDimensionValue(
        buf,
        valueType,
        valueCount,
        valueOffsetField,
        littleEndian,
      );
      if (v && v > 0) {
        if (tag === TAG_IMAGE_WIDTH || tag === TAG_EXIF_WIDTH) width = v;
        if (tag === TAG_IMAGE_HEIGHT || tag === TAG_EXIF_HEIGHT) height = v;
      }
    }
    if (tag === TAG_EXIF_IFD && valueType === 4 && valueCount >= 1) {
      exifIfdOffset = valueOffsetField;
    }
  }
  return { width, height, exifIfdOffset };
}

function parseTiffSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 8) return null;
  const isLE =
    buf[0] === TIFF_LE_SIG[0] &&
    buf[1] === TIFF_LE_SIG[1] &&
    buf[2] === TIFF_LE_SIG[2] &&
    buf[3] === TIFF_LE_SIG[3];
  const isBE =
    buf[0] === TIFF_BE_SIG[0] &&
    buf[1] === TIFF_BE_SIG[1] &&
    buf[2] === TIFF_BE_SIG[2] &&
    buf[3] === TIFF_BE_SIG[3];
  if (!isLE && !isBE) return null;
  const littleEndian = isLE;
  const firstIfdOffset = readU32(buf, 4, littleEndian);
  const ifd0 = parseTiffIfd(buf, 0, firstIfdOffset, littleEndian);
  if (!ifd0) return null;
  if (ifd0.width && ifd0.height) return { width: ifd0.width, height: ifd0.height };
  if (ifd0.exifIfdOffset != null) {
    const exifIfd = parseTiffIfd(buf, 0, ifd0.exifIfdOffset, littleEndian);
    if (exifIfd?.width && exifIfd?.height) return { width: exifIfd.width, height: exifIfd.height };
  }
  return null;
}

async function getFileEncodedSize(uri: string): Promise<{ width: number; height: number } | null> {
  const path = sanitizeFilePath(uri);
  if (!path) return null;
  let probePath: string | null = null;
  try {
    const stat = await RNBlobUtil.fs.stat(path);
    const sizeValue = typeof stat.size === 'string' ? Number.parseInt(stat.size, 10) : Number(stat.size);
    if (!Number.isFinite(sizeValue) || sizeValue <= 0) return null;

    const readBytes = Math.min(sizeValue, DIMENSION_PROBE_BYTES);
    if (readBytes < sizeValue) {
      probePath = `${RNBlobUtil.fs.dirs.CacheDir}/dim-probe-${Date.now()}.bin`;
      await RNBlobUtil.fs.slice(path, probePath, 0, readBytes);
    }

    const sourcePath = probePath ?? path;
    const b64 = await RNBlobUtil.fs.readFile(sourcePath, 'base64');
    const buf = Buffer.from(b64, 'base64');
    return parseJpegSize(buf) ?? parsePngSize(buf) ?? parseBmpSize(buf) ?? parseTiffSize(buf);
  } catch {
    return null;
  } finally {
    if (probePath) {
      await RNBlobUtil.fs.unlink(probePath).catch(() => {});
    }
  }
}

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
    setTransformRef,
    gestureHandlers,
  } = useZoomPanGesture(widthRef, heightRef, rotationRef, minZoomRef, doubleTapZoomRef);

  const getDecodedSize = (imageUri: string) =>
    new Promise<{ width: number; height: number } | null>((resolve) => {
      Image.getSize(
        imageUri,
        (w, h) => resolve({ width: w, height: h }),
        () => resolve(null),
      );
    });

  useEffect(() => {
    let alive = true;
    const applySize = (w: number, h: number) => {
      if (!alive) return;
      setImageSize({ width: w, height: h });
      const nextFitScale = Math.min(SCREEN_WIDTH / w, SCREEN_HEIGHT / h);
      minZoomRef.current = nextFitScale;
      doubleTapZoomRef.current = 1.0; // 1:1 pixel mapping on double-tap
      setTransformRef.current(nextFitScale, 0, 0);
    };

    (async () => {
      const encodedSize = await getFileEncodedSize(uri);
      const decodedSize = await getDecodedSize(uri);
      const nextSize = useTiledView ? (encodedSize ?? decodedSize) : (decodedSize ?? encodedSize);
      if (nextSize) {
        applySize(nextSize.width, nextSize.height);
      } else {
        // Fallback: keep default screen-sized rendering.
      }

    })();

    return () => {
      alive = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const fitScale = imageSize
    ? Math.min(SCREEN_WIDTH / imageSize.width, SCREEN_HEIGHT / imageSize.height)
    : 1;
  const useTiledView = Platform.OS === 'android';

  const imgW = imageSize?.width ?? SCREEN_WIDTH;
  const imgH = imageSize?.height ?? SCREEN_HEIGHT;

  // Keep image hidden until both the size is known (so we can set the right initial scale)
  // and the image is actually loaded (to avoid a flash at the wrong scale).
  const imageVisible = (useTiledView || loaded) && imageSize != null;

  return (
    <FullScreenViewerShell
      onClose={onClose}
      onFit={() => setTransformRef.current(fitScale, 0, 0)}
      onRotate={() => setRotation((r) => (r + 90) % 360)}
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
            width: useTiledView ? SCREEN_WIDTH : imgW,
            height: useTiledView ? SCREEN_HEIGHT : imgH,
            transform: useTiledView
              ? undefined
              : [
                  { translateX: txAnim },
                  { translateY: tyAnim },
                  { scale: scaleAnim },
                ],
          }}
          onStartShouldSetResponder={useTiledView ? undefined : () => true}
          onMoveShouldSetResponder={useTiledView ? undefined : () => true}
          onResponderTerminationRequest={useTiledView ? undefined : () => false}
          onResponderGrant={useTiledView ? undefined : gestureHandlers.onResponderGrant}
          onResponderMove={useTiledView ? undefined : gestureHandlers.onResponderMove}
          onResponderRelease={useTiledView ? undefined : gestureHandlers.onResponderRelease}
          onResponderTerminate={useTiledView ? undefined : gestureHandlers.onResponderTerminate}
        >
          {useTiledView ? (
            <RawTiledImageView
              uri={uri}
              style={{
                width: SCREEN_WIDTH,
                height: SCREEN_HEIGHT,
                opacity: imageVisible ? 1 : 0,
              }}
            />
          ) : (
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
          )}
        </Animated.View>
      </View>
    </FullScreenViewerShell>
  );
}
