#!/usr/bin/env bash
set -euo pipefail
missing=0
require() {
  if ! grep -q "$2" "$1"; then
    echo "::error::$1 has no '$2', so patches/ did not reach node_modules"
    missing=1
  fi
}
require node_modules/expo-camera/ios/Current/CameraPhotoCapture.swift describeCaptureFailure
require node_modules/expo-camera/ios/Current/CameraPhotoCapture.swift retriedWithPlainSettings
require node_modules/expo-camera/ios/Current/CameraSessionManager.swift disableDeferredPhotoDelivery
require node_modules/expo-camera/ios/Current/CameraSessionManager.swift observeInterruptions
require node_modules/expo-camera/ios/Current/CameraPhotoCapture.swift lastInterruption
require node_modules/expo-camera/ios/Current/CameraSessionManager.swift startRunningPersistently
require node_modules/expo-camera/ios/Current/CameraView.swift readinessObservation
require node_modules/expo-camera/ios/Common/CameraExceptions.swift CameraImageCaptureDetailedException
require node_modules/expo-sensors/ios/DeviceMotionModule.swift '"magneticField":'
require node_modules/expo-sensors/ios/DeviceMotionModule.swift 'magneticField.accuracy.rawValue'
if [ "$missing" -ne 0 ]; then
  echo "::error::Refusing to build, required native patches are missing from the sources CocoaPods compiles"
  exit 1
fi
echo "Native patches present in node_modules."
