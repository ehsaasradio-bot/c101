#!/bin/bash
# Builds and installs the spike on a simulator without an Xcode project: the
# sources are compiled against the simulator SDK and the .app is assembled by
# hand. Enough to judge the idea on something running.
set -e

SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
APP="build/CalcSpike.app"
DEVICE="${1:-iPhone 17 Pro}"

rm -rf build && mkdir -p "$APP"

xcrun swiftc \
  -sdk "$SDK" \
  -target arm64-apple-ios17.0-simulator \
  -framework JavaScriptCore \
  -O \
  -o "$APP/CalcSpike" \
  CalcSpike/*.swift

cat > "$APP/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>CalcSpike</string>
  <key>CFBundleIdentifier</key><string>xyz.calc101.spike</string>
  <key>CFBundleName</key><string>Calc101</string>
  <key>CFBundleDisplayName</key><string>Calc101</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSRequiresIPhoneOS</key><true/>
  <key>MinimumOSVersion</key><string>17.0</string>
  <key>UILaunchScreen</key><dict/>
  <key>UISupportedInterfaceOrientations</key>
  <array><string>UIInterfaceOrientationPortrait</string></array>
</dict></plist>
PLIST

# The two generated artefacts ship as app resources — offline by construction,
# since nothing here needs a server.
cp ../Shared/bridge.js ../Shared/catalog.json "$APP/"

xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl install "$DEVICE" "$APP"
xcrun simctl launch "$DEVICE" xyz.calc101.spike
echo "installed and launched on $DEVICE"
