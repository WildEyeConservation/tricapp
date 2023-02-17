package com.example.networkscanner;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.Arguments;

import java.util.List;

public class NetworkScannerModule extends ReactContextBaseJavaModule {

    private NetworkScanner scanner = new NetworkScanner();

    public NetworkScannerModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "NetworkScanner";
    }

    @ReactMethod
    public void scan(Promise promise) {
        List<String> addresses = scanner.scan();
        WritableArray promiseArray = Arguments.createArray();
        for (String lang:addresses) {  
            promiseArray.pushString(lang);  
        }
        promise.resolve(promiseArray);
    }

    @ReactMethod
    public void localIps(Callback callback) {
        List<String> addresses = scanner.getLocalIpAddress();
        WritableArray callbackArray = Arguments.createArray();
        for (String lang:addresses) {  
            callbackArray.pushString(lang);  
        }
        callback.invoke(callbackArray);
    }
}
