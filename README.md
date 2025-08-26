Notes for startup:

Install cli-platform-android with:

```
npm i -D @react-native-community/cli@^9 @react-native-community/cli-platform-android@^9
```

Changes to npm libraries:

react-native-bluetooth-serial/android/build.gradle:

```
dependencies {
    // compile 'com.facebook.react:react-native:+'
    implementation "com.facebook.react:react-native:+"
}
```

react-native-bluetooth-serial/android/src/main/java/RCTBluetoothSerialPackage.java:

```
// @Override
// public List<Class<? extends JavaScriptModule>> createJSModules() {
//     return Collections.emptyList();
// }
```
