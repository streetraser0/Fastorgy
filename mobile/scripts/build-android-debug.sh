#!/usr/bin/env bash
set -euo pipefail
mobile_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$mobile_root"
# Prefer the verified checkout-local JDK when the host only has a Java runtime.
if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME:-}/bin/javac" ]]; then
  for bundled_jdk_path in "$mobile_root"/.jdk/*; do
    if [[ -x "$bundled_jdk_path/bin/javac" ]]; then
      export JAVA_HOME="$bundled_jdk_path"
      export PATH="$JAVA_HOME/bin:$PATH"
      break
    fi
  done
fi
export ANDROID_HOME="${ANDROID_HOME:-$mobile_root/.android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$mobile_root/.gradle-cache}"
if [[ ! -d "$ANDROID_HOME/platforms/android-36" ]]; then
  echo 'Android SDK API 36 is required. Install it with Android Studio or sdkmanager.' >&2
  exit 1
fi
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
npm run sync
npm run check
cd android
./gradlew --no-daemon assembleDebug
mkdir -p ../../releases
cp app/build/outputs/apk/debug/app-debug.apk ../../releases/fas-torgi-android-demo-debug.apk
printf 'Built %s\n' "$mobile_root/../releases/fas-torgi-android-demo-debug.apk"
