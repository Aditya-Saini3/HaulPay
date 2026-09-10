import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * HaulPay app config.
 *
 * MapLibre GL Native ships a config plugin, which means this project cannot run
 * in Expo Go. Everything here targets an Expo Dev Client build from the start.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "HaulPay",
  slug: "haulpay",
  version: "1.0.0",
  scheme: "haulpay",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.haulpay.app",
    usesAppleSignIn: true,
    infoPlist: {
      // Foreground only. HaulPay never asks for background location: routes are
      // drawn from typed addresses, not from where the phone is.
      NSLocationWhenInUseUsageDescription:
        "HaulPay can fill in a stop address from your current location. Location is only read while the app is open.",
      NSCameraUsageDescription:
        "Attach photos of rate confirmations, BOLs and receipts to loads and expenses.",
      NSPhotoLibraryUsageDescription:
        "Attach existing photos of rate confirmations, BOLs and receipts.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.haulpay.app",
    adaptiveIcon: {
      backgroundColor: "#0B1116",
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    permissions: [
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.CAMERA",
      "android.permission.INTERNET",
    ],
    blockedPermissions: [
      // Explicit: no background location, ever.
      "android.permission.ACCESS_BACKGROUND_LOCATION",
    ],
  },
  plugins: [
    "expo-router",
    "expo-dev-client",
    "expo-secure-store",
    "expo-apple-authentication",
    "expo-web-browser",
    "@maplibre/maplibre-react-native",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        backgroundColor: "#0B1116",
        dark: { backgroundColor: "#0B1116" },
        imageWidth: 200,
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "HaulPay can fill in a stop address from your current location.",
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Attach existing photos of rate confirmations, BOLs and receipts.",
        cameraPermission:
          "Take photos of rate confirmations, BOLs and receipts.",
      },
    ],
    [
      "expo-build-properties",
      {
        // SDK 57 requires iOS 16.4 as its floor.
        ios: { deploymentTarget: "16.4" },
        android: { minSdkVersion: 24, compileSdkVersion: 36, targetSdkVersion: 36 },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
  },
});
