package com.example.rawimageprocessor;

import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Log;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.io.File;

public class RawImageProcessorModule extends ReactContextBaseJavaModule {
    private static final String TAG = "RawImageProcessor";

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

                File cacheDir = getReactApplicationContext().getCacheDir();
                String outName = "raw_full_" + System.currentTimeMillis() + ".bmp";
                File outFile = new File(cacheDir, outName);

                String nativeOut = nativeConvertRawToBmp(sourcePath, outFile.getAbsolutePath());
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

                promise.resolve(Uri.fromFile(new File(nativeOut)).toString());
            } catch (Throwable t) {
                promise.reject("ERAW", t);
            }
        }).start();
    }

    private static native String nativeConvertRawToBmp(String inputPath, String outputPath);
}
