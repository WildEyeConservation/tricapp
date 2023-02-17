package com.example.networkscanner;

import java.io.IOException;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.List;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.util.Enumeration;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.lang.reflect.Method;

import android.net.wifi.WifiManager;
import android.net.wifi.WifiConfiguration;
import android.content.Context;

public class NetworkScanner {

    private static final int TIMEOUT = 60;
    private static final String IP_ADDRESS_PATTERN = "^192\\.168\\..*\\..*$";
    private static final Pattern pattern = Pattern.compile(IP_ADDRESS_PATTERN);

    public static List<String> scan() {
        List<String> addresses = new ArrayList<>();
        List<String> localIps = getLocalIpAddress();

        for (String ip : localIps) {
            String subnet = ip.substring(0, ip.lastIndexOf(".")+1);
            for (int i = 1; i <= 255; i++) {
                String host = subnet + i;

                if (host.compareTo(ip) == 0) {
                    continue;
                }

                try {
                    InetAddress inetAddress = InetAddress.getByName(host);                    
                    if (inetAddress.isReachable(TIMEOUT)) {
                        addresses.add(inetAddress.getHostAddress());
                        // addresses.add(inetAddress.getHostName());
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }

        return addresses;
    }

    private static boolean isValidIP(final String ipAddress) {
        Matcher matcher = pattern.matcher(ipAddress);
        return matcher.matches();
    }

    public static List<String> getLocalIpAddress() {
        List<String> addresses = new ArrayList<>();
        try {
            for (Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces(); en.hasMoreElements();) {
                NetworkInterface intf = en.nextElement();
                for (Enumeration<InetAddress> enumIpAddr = intf.getInetAddresses(); enumIpAddr.hasMoreElements();) {
                    InetAddress inetAddress = enumIpAddr.nextElement();
                    if (!inetAddress.isLoopbackAddress() && !inetAddress.isLinkLocalAddress()) {
                        if (isValidIP(inetAddress.getHostAddress().toString())) {
                            addresses.add(inetAddress.getHostAddress().toString());
                        }
                    }
                }
            }
        } catch (SocketException ex) {
            ex.printStackTrace();
        }
        return addresses;
    }
    
    public static String getSubnetMask() {
        try {
            for (Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces(); en.hasMoreElements();) {
                NetworkInterface intf = en.nextElement();
                for (Enumeration<InetAddress> enumIpAddr = intf.getInetAddresses(); enumIpAddr.hasMoreElements();) {
                    InetAddress inetAddress = enumIpAddr.nextElement();
                    if (!inetAddress.isLoopbackAddress() && !inetAddress.isLinkLocalAddress()) {
                        return intf.getInterfaceAddresses().get(0).getNetworkPrefixLength() + "";
                    }
                }
            }
        } catch (SocketException ex) {
            ex.printStackTrace();
        }
        return null;
    }

}
