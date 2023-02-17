package com.example.hotspotmanager;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkRequest;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.lang.reflect.Method;

import androidx.annotation.NonNull;

public class HotspotManager {

    private static final String TAG = "HotspotManager";

    public static void startHotspot(@NonNull Context context, String ssid, String password) {
        final WifiManager wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        final ConnectivityManager connectivityManager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        final NetworkRequest.Builder builder = new NetworkRequest.Builder();
        builder.addTransportType(NetworkCapabilities.TRANSPORT_WIFI);

        if (wifiManager != null && connectivityManager != null) {
            // Check if Wi-Fi hotspot is supported

            Method[] methods = wifiManager.getClass().getDeclaredMethods();
            for (Method method : methods) {
                if (method.getName().equals("isWifiApEnabled")) {
                    try {
                        boolean isWifiApEnabled = (boolean) method.invoke(wifiManager);
                        if (isWifiApEnabled) {
                            // Disable existing hotspot before starting new one
                            Method method1 = wifiManager.getClass().getMethod("setWifiApEnabled", WifiConfiguration.class, boolean.class);
                            method1.invoke(wifiManager, null, false);
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            }

            // Create a new hotspot configuration
            final WifiConfiguration config = new WifiConfiguration();
            config.SSID = ssid;
            config.preSharedKey = password;
            config.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK);

            // Start the hotspot using the system APIs
            wifiManager.startLocalOnlyHotspot(new WifiManager.LocalOnlyHotspotCallback() {
                @Override
                public void onStarted(WifiManager.LocalOnlyHotspotReservation reservation) {
                    super.onStarted(reservation);

                    Log.d(TAG, "Hotspot started with SSID: " + ssid + " Password: " + password);

                    // Listen for client connections
                    connectivityManager.registerNetworkCallback(builder.build(), new ConnectivityManager.NetworkCallback() {
                        @Override
                        public void onAvailable(@NonNull android.net.Network network) {
                            super.onAvailable(network);

                            // Handle the new client connection
                            Handler handler = new Handler(Looper.getMainLooper());
                            handler.post(() -> {
                                // Notify the React Native context of the new client connection
                                // Use whatever method you need to notify the context
                            });
                        }
                    });
                }

                @Override
                public void onFailed(int reason) {
                    super.onFailed(reason);
                    Log.d(TAG, "Failed to start hotspot");
                }
            }, new Handler(Looper.getMainLooper()));
        }
    }
}