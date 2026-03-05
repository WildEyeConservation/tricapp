import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RootStackParamList } from './types';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconCom from 'react-native-vector-icons/MaterialCommunityIcons';
import DeviceInfo from 'react-native-device-info';
import { useSelector } from 'react-redux';
import { RootState } from '../store/types';
import { hotspotInfo } from '../screens/HomeScreen';
import { defaultHotspot } from '../network/wifi';

import HomeScreen from '../screens/HomeScreen';
import SetupScreen from '../screens/SetupScreen';
import CaptureScreen from '../screens/CaptureScreen';
import { HomeProps, SetupProps, CaptureProps } from '../navigation/types';

// ---------------------------------------------------------------------------
// Drawer context – lets any child screen open / close the drawer
// ---------------------------------------------------------------------------
interface DrawerContextType {
  openDrawer: () => void;
  closeDrawer: () => void;
}
export const DrawerContext = createContext<DrawerContextType>({
  openDrawer: () => {},
  closeDrawer: () => {},
});

// ---------------------------------------------------------------------------
// GPS status context – hasFix: phone has a recent GPS position
//                      isLogging: positions are being written to the CSV
// ---------------------------------------------------------------------------
export interface GpsStatusContextType {
  hasFix: boolean;
  isLogging: boolean;
  setHasFix: (v: boolean) => void;
  setIsLogging: (v: boolean) => void;
}
export const GpsStatusContext = createContext<GpsStatusContextType>({
  hasFix: false,
  isLogging: false,
  setHasFix: () => {},
  setIsLogging: () => {},
});

// ---------------------------------------------------------------------------
// Capture status context – header color: green when capturing, red when error
// ---------------------------------------------------------------------------
export interface CaptureStatusContextType {
  isCapturing: boolean;
  isError: boolean;
  setIsCapturing: (v: boolean) => void;
  setIsError: (v: boolean) => void;
}
export const CaptureStatusContext = createContext<CaptureStatusContextType>({
  isCapturing: false,
  isError: false,
  setIsCapturing: () => {},
  setIsError: () => {},
});

const HEADER_GREEN = '#1C463C';
const HEADER_RED = '#C62828';
const HEADER_DEFAULT = '#f5f5f5';

// ---------------------------------------------------------------------------
// Drawer content – mirrors what AboutScreen used to show
// ---------------------------------------------------------------------------
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 340);

const DrawerContent = ({ onClose }: { onClose: () => void }) => {
  const ip = useSelector((state: RootState) => state.bt.ip);
  const [version, setVersion] = useState('');

  useEffect(() => {
    setVersion(DeviceInfo.getReadableVersion());
  }, []);

  let ssid = defaultHotspot.SSID ?? '';
  let password = defaultHotspot.password ?? '';
  if (hotspotInfo?.SSID && hotspotInfo?.password) {
    ssid = hotspotInfo.SSID;
    password = hotspotInfo.password;
  }

  return (
    <View style={drawerStyles.container}>
      {/* Header */}
      <View style={drawerStyles.header}>
        <Text style={drawerStyles.headerTitle}>TricApp</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Icon name="close" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* General */}
        <View style={drawerStyles.section}>
          <Text style={drawerStyles.sectionTitle}>General</Text>
          <View style={drawerStyles.divider} />
          <View style={drawerStyles.row}>
            <Text style={drawerStyles.label}>Software version</Text>
            <Text style={drawerStyles.value}>v{version}</Text>
          </View>
        </View>

        <View style={drawerStyles.sectionSpacer} />

        {/* Hotspot */}
        <View style={drawerStyles.section}>
          <Text style={drawerStyles.sectionTitle}>Hotspot</Text>
          <View style={drawerStyles.divider} />
          <View style={drawerStyles.row}>
            <Text style={drawerStyles.label}>SSID</Text>
            <Text style={drawerStyles.value}>{ssid}</Text>
          </View>
          <View style={drawerStyles.row}>
            <Text style={drawerStyles.label}>Password</Text>
            <Text style={drawerStyles.value}>{password}</Text>
          </View>
          {ip !== '' && (
            <View style={drawerStyles.row}>
              <Text style={drawerStyles.label}>Raspberry Pi</Text>
              <Text style={drawerStyles.value}>@{ip}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Animated slide-from-left drawer overlay
// ---------------------------------------------------------------------------
const AppDrawer = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0.45,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => setRendered(false));
    }
  }, [visible]);

  if (!rendered) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#000', opacity: backdropOpacity },
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Panel */}
      <Animated.View
        style={[
          drawerStyles.panel,
          { width: DRAWER_WIDTH, transform: [{ translateX }] },
        ]}
      >
        <DrawerContent onClose={onClose} />
      </Animated.View>
    </View>
  );
};

const drawerStyles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#fff',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  label: {
    color: '#333',
    fontSize: 14,
  },
  value: {
    color: '#111',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  sectionSpacer: {
    height: 8,
  },
});

// ---------------------------------------------------------------------------
// Stack navigators
// ---------------------------------------------------------------------------
const HomeStack = createNativeStackNavigator<RootStackParamList>();
const SetupStack = createNativeStackNavigator<RootStackParamList>();
const CaptureStack = createNativeStackNavigator<RootStackParamList>();

const HomeNav = ({ navigation }: HomeProps) => {
  const { openDrawer } = useContext(DrawerContext);
  const { hasFix, isLogging } = useContext(GpsStatusContext);
  const { isCapturing, isError } = useContext(CaptureStatusContext);
  const headerBg = isError ? HEADER_RED : isCapturing ? HEADER_GREEN : HEADER_DEFAULT;
  return (
    <HomeStack.Navigator
      initialRouteName="HomeStack"
      screenOptions={{ headerShown: true, headerStyle: { backgroundColor: headerBg } }}
    >
      <HomeStack.Screen
        name="HomeStack"
        component={HomeScreen}
        options={{
          title: 'Home',
          headerLeft: () => (
            <TouchableOpacity
              onPress={openDrawer}
              style={{ marginLeft: 4, padding: 4 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="menu" size={26} color="#333" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 6 }}>
              {hasFix && (
                <Icon
                  name="gps-fixed"
                  size={22}
                  color="black"
                  style={{ marginRight: isLogging ? 6 : 0 }}
                />
              )}
              {isLogging && (
                <IconCom name="content-save" size={22} color="black" />
              )}
            </View>
          ),
        }}
      />
    </HomeStack.Navigator>
  );
};

const CaptureNav = ({ navigation }: CaptureProps) => {
  const { openDrawer } = useContext(DrawerContext);
  const { isCapturing, isError } = useContext(CaptureStatusContext);
  const headerBg = isError ? HEADER_RED : isCapturing ? HEADER_GREEN : HEADER_DEFAULT;
  return (
    <CaptureStack.Navigator
      screenOptions={{ headerShown: true, headerStyle: { backgroundColor: headerBg } }}
    >
      <CaptureStack.Screen
        name="CaptureStack"
        component={CaptureScreen}
        options={{
          title: 'Capture',
          headerLeft: () => (
            <TouchableOpacity
              onPress={openDrawer}
              style={{ marginLeft: 4, padding: 4 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="menu" size={26} color="#333" />
            </TouchableOpacity>
          ),
        }}
      />
    </CaptureStack.Navigator>
  );
};

const SetupNav = ({ navigation }: SetupProps) => {
  const { openDrawer } = useContext(DrawerContext);
  const { isCapturing, isError } = useContext(CaptureStatusContext);
  const headerBg = isError ? HEADER_RED : isCapturing ? HEADER_GREEN : HEADER_DEFAULT;
  return (
    <SetupStack.Navigator
      screenOptions={{ headerShown: true, headerStyle: { backgroundColor: headerBg } }}
    >
      <SetupStack.Screen
        name="SetupStack"
        component={SetupScreen}
        options={{
          title: 'Setup',
          headerLeft: () => (
            <TouchableOpacity
              onPress={openDrawer}
              style={{ marginLeft: 4, padding: 4 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="menu" size={26} color="#333" />
            </TouchableOpacity>
          ),
        }}
      />
    </SetupStack.Navigator>
  );
};

// ---------------------------------------------------------------------------
// Tab navigator
// ---------------------------------------------------------------------------
const Tab = createBottomTabNavigator();

const TabNav = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1C463C',
        tabBarInactiveTintColor: 'black',
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeNav}
        options={{
          tabBarIcon: ({ color }) => <Icon name="home" size={24} color={color} />,
        }}
      />
      <Tab.Screen
        name="Capture"
        component={CaptureNav}
        options={{
          tabBarIcon: ({ color }) => <Icon name="camera" size={24} color={color} />,
        }}
      />
      <Tab.Screen
        name="Setup"
        component={SetupNav}
        options={{
          tabBarIcon: ({ color }) => <Icon name="settings" size={24} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
};

// ---------------------------------------------------------------------------
// Root – wraps everything with the drawer context + overlay
// ---------------------------------------------------------------------------
const AppNav = () => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [hasFix, setHasFix] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isError, setIsError] = useState(false);

  return (
    <DrawerContext.Provider
      value={{
        openDrawer: () => setDrawerVisible(true),
        closeDrawer: () => setDrawerVisible(false),
      }}
    >
      <GpsStatusContext.Provider value={{ hasFix, isLogging, setHasFix, setIsLogging }}>
        <CaptureStatusContext.Provider
          value={{ isCapturing, isError, setIsCapturing, setIsError }}
        >
          <View style={{ flex: 1 }}>
            <TabNav />
            <AppDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
          </View>
        </CaptureStatusContext.Provider>
      </GpsStatusContext.Provider>
    </DrawerContext.Provider>
  );
};

export default AppNav;
