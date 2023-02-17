package com.example.hotspotmanager;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.Arguments;

import java.util.List;

public class HotspotManagerModule extends ReactContextBaseJavaModule {

    private HotspotManager hotspotManager = new HotspotManager();

    public HotspotManagerModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "HotspotManager";
    }

    @ReactMethod
    public void startHotspot(String ssid, String password) {
        hotspotManager.startHotspot(getReactApplicationContext(), ssid, password);
    }
}
