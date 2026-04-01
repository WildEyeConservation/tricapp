package com.example.rawimageprocessor;

import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Log;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import java.io.File;
import java.util.Locale;

public class RawImageProcessorModule extends ReactContextBaseJavaModule {
    private static final String TAG = "RawImageProcessor";
    private static final String STAGE_PREVIEW = "preview";
    private static final String STAGE_FULL = "full";

    static {
        System.loadLibrary("rawimageprocessor_jni");
    }

    public RawImageProcessorModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "RawImageProcessor";
    }

    @ReactMethod
    public void convertArwToPng(String filePath, Promise promise) {
        new Thread(() -> {
            try {
                final String sourcePath = filePath.startsWith("file://")
                        ? filePath.replaceFirst("^file://", "")
                        : filePath;
                final File input = new File(sourcePath);
                if (!input.exists()) {
                    promise.reject("ENOENT", "File does not exist: " + sourcePath);
                    return;
                }
                Log.i(TAG, "convertArwToPng source=" + sourcePath + " bytes=" + input.length());

                File cacheDir = getReactApplicationContext().getCacheDir();
                String cacheKey = Integer.toHexString(
                        String.format(
                                Locale.US,
                                "%s_%d_%d",
                                input.getAbsolutePath(),
                                input.length(),
                                input.lastModified()
                        ).hashCode()
                );

                File previewFile = new File(cacheDir, "raw_preview_" + cacheKey + ".jpg");
                String stage = STAGE_PREVIEW;
                String nativeOut = previewFile.exists()
                        ? previewFile.getAbsolutePath()
                        : nativeExtractRawThumbJpeg(sourcePath, previewFile.getAbsolutePath());

                // Fallback: full RAW decode when no embedded thumbnail is available.
                if (nativeOut == null) {
                    File fullFile = new File(cacheDir, "raw_full_" + cacheKey + ".bmp");
                    nativeOut = fullFile.exists()
                            ? fullFile.getAbsolutePath()
                            : nativeConvertRawToBmp(sourcePath, fullFile.getAbsolutePath());
                    stage = STAGE_FULL;
                }
                if (nativeOut == null) {
                    promise.reject(
                            "EDECODE",
                            "LibRaw decode failed. The RAW file may be unsupported or corrupted."
                    );
                    return;
                }

                BitmapFactory.Options opts = new BitmapFactory.Options();
                opts.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(nativeOut, opts);
                Log.i(TAG, "LibRaw output file: " + nativeOut + " dims=" + opts.outWidth + "x" + opts.outHeight);
                promise.resolve(buildResult(stage, nativeOut, opts.outWidth, opts.outHeight));
            } catch (Throwable t) {
                promise.reject("ERAW", t);
            }
        }).start();
    }

    @ReactMethod
    public void convertArwToFullBmp(String filePath, Promise promise) {
        new Thread(() -> {
            try {
                final String sourcePath = filePath.startsWith("file://")
                        ? filePath.replaceFirst("^file://", "")
                        : filePath;
                final File input = new File(sourcePath);
                if (!input.exists()) {
                    promise.reject("ENOENT", "File does not exist: " + sourcePath);
                    return;
                }
                Log.i(TAG, "convertArwToFullBmp source=" + sourcePath + " bytes=" + input.length());

                File cacheDir = getReactApplicationContext().getCacheDir();
                String cacheKey = Integer.toHexString(
                        String.format(
                                Locale.US,
                                "%s_%d_%d",
                                input.getAbsolutePath(),
                                input.length(),
                                input.lastModified()
                        ).hashCode()
                );
                File fullFile = new File(cacheDir, "raw_full_" + cacheKey + ".bmp");

                String nativeOut = fullFile.exists()
                        ? fullFile.getAbsolutePath()
                        : nativeConvertRawToBmp(sourcePath, fullFile.getAbsolutePath());
                if (nativeOut == null) {
                    promise.reject(
                            "EDECODE",
                            "LibRaw full decode failed. The RAW file may be unsupported or corrupted."
                    );
                    return;
                }

                BitmapFactory.Options opts = new BitmapFactory.Options();
                opts.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(nativeOut, opts);
                Log.i(TAG, "LibRaw full output file: " + nativeOut + " dims=" + opts.outWidth + "x" + opts.outHeight);
                promise.resolve(buildResult(STAGE_FULL, nativeOut, opts.outWidth, opts.outHeight));
            } catch (Throwable t) {
                promise.reject("ERAW", t);
            }
        }).start();
    }

    private WritableMap buildResult(String stage, String nativePath, int width, int height) {
        WritableMap result = Arguments.createMap();
        result.putString("stage", stage);
        result.putString("uri", Uri.fromFile(new File(nativePath)).toString());
        result.putInt("width", Math.max(0, width));
        result.putInt("height", Math.max(0, height));
        return result;
    }

    private static native String nativeExtractRawThumbJpeg(String inputPath, String outputPath);
    private static native String nativeConvertRawToBmp(String inputPath, String outputPath);
}
