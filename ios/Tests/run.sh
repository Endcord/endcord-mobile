#!/usr/bin/env bash
# The tweak's test on the iOS simulator, run by the simulator job of .github/workflows/ios.yml on macOS: Host.mm, a
# stand-in for Discord with a real Hermes runtime of the given bytecode version, loads the simulator build of the tweak,
# which downloads its bundle from server.py. One launch per scenario, each prepared here (the app's files, what the
# server serves); Host.mm checks what happened and run.sh what the launches left behind.
#
#   run.sh <Endcord.dylib built for the simulator> <bytecode version: 98 or 99> <results folder>
#
# The tweak has to be built with ENDCORD_BUNDLE_URL=http://127.0.0.1:4040/endcord.min.js.
set -uo pipefail

DYLIB=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
VERSION=$2
RESULTS=$(mkdir -p "$3" && cd "$3" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
APP_ID=com.endcord.testhost
PORT=4040
REPOSITORY=${GITHUB_REPOSITORY:-Endcord/endcord-mobile}

# The Hermes release of each bytecode version, as in bundle/scripts/hermes.mjs
release_of() { case $1 in 98) echo 250829098.0.15 ;; 99) echo 260318099.0.5 ;; esac; }
OTHER=$([ "$VERSION" = 98 ] && echo 99 || echo 98)
RELEASE=$(release_of "$VERSION")

fail() { echo "::error::$*"; echo "FAIL: $*" >> "$RESULTS/summary.txt"; }
pass() { echo "PASS: $*" >> "$RESULTS/summary.txt"; }
: > "$RESULTS/summary.txt"

echo "::group::Hermes $RELEASE (bytecode $VERSION)"
curl -fsSL --retry 3 -o "$WORK/hermes.tgz" \
    "https://repo1.maven.org/maven2/com/facebook/hermes/hermes-ios/$RELEASE/hermes-ios-$RELEASE-hermes-ios-release.tar.gz"
mkdir "$WORK/hermes" && tar -xzf "$WORK/hermes.tgz" -C "$WORK/hermes"
FRAMEWORK=$(find "$WORK/hermes" -path "*ios-arm64_x86_64-simulator/*.framework" -maxdepth 7 -type d | head -n 1)
echo "Runtime: $FRAMEWORK"
for v in "$VERSION" "$OTHER"; do
    curl -fsSL --retry 3 -o "$WORK/compiler-$v.tgz" "https://registry.npmjs.org/hermes-compiler/-/hermes-compiler-$(release_of "$v").tgz"
    mkdir "$WORK/compiler-$v" && tar -xzf "$WORK/compiler-$v.tgz" -C "$WORK/compiler-$v"
    chmod +x "$WORK/compiler-$v/package/hermesc/osx-bin/hermesc"
done
HERMESC="$WORK/compiler-$VERSION/package/hermesc/osx-bin/hermesc"
echo "::endgroup::"

echo "::group::Bundles"
SERVE="$WORK/serve"
mkdir -p "$SERVE"
script() { echo "$2" > "$WORK/$1.js"; }
compile() { "$1" -emit-binary -out "$3" "$2"; }
script host 'globalThis.__HOST_BUNDLE__ = 1;'
script hbc 'globalThis.__TEST_BUNDLE__ = "hbc";'
script hbc2 'globalThis.__TEST_BUNDLE__ = "hbc2";'
script other 'globalThis.__TEST_BUNDLE__ = "other";'
compile "$HERMESC" "$WORK/host.js" "$WORK/main.jsbundle"
compile "$HERMESC" "$WORK/hbc.js" "$WORK/hbc.hbc"
compile "$HERMESC" "$WORK/hbc2.js" "$WORK/hbc2.hbc"
compile "$WORK/compiler-$OTHER/package/hermesc/osx-bin/hermesc" "$WORK/other.js" "$SERVE/other-version.hbc"
echo 'globalThis.__TEST_BUNDLE__ = "js";' > "$SERVE/endcord.min.js"
echo 'globalThis.__TEST_BUNDLE__ = "custom";' > "$SERVE/custom.js"
echo 'globalThis.__TEST_BUNDLE__ = "throws"; throw new Error("boom");' > "$SERVE/throws.js"
cp "$WORK/hbc.hbc" "$SERVE/endcord.v$VERSION.hbc"
# What users download
curl -fsSL --retry 3 -o "$SERVE/real.hbc" "https://raw.githubusercontent.com/$REPOSITORY/builds-next/endcord.v$VERSION.hbc"
ls -l "$SERVE"
echo "::endgroup::"

echo "::group::Build the host app"
APP="$WORK/Host.app"
mkdir -p "$APP/Frameworks"
cat > "$APP/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>$APP_ID</string>
<key>CFBundleExecutable</key><string>Host</string>
<key>CFBundleName</key><string>Host</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
<key>MinimumOSVersion</key><string>15.0</string>
<key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>
<key>UILaunchScreen</key><dict/>
<key>RCTNewArchEnabled</key><true/>
</dict></plist>
EOF
cp "$WORK/main.jsbundle" "$APP/"
cp -R "$FRAMEWORK" "$APP/Frameworks/"
cp "$DYLIB" "$APP/Frameworks/Endcord.dylib"
# In an app group, as a sideloaded Discord signed with one is: the simulator reads the entitlements linked into the app
cat > "$WORK/host.entitlements" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>com.apple.security.application-groups</key><array><string>group.com.endcord.test</string></array>
</dict></plist>
EOF
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
xcrun --sdk iphonesimulator clang++ -target arm64-apple-ios15.0-simulator -isysroot "$SDK" -std=c++17 -fobjc-arc \
    -I "$WORK/hermes/destroot/include" -F "$(dirname "$FRAMEWORK")" -framework "$(basename "$FRAMEWORK" .framework)" \
    -framework UIKit -framework Foundation -framework ReplayKit -Wl,-rpath,@executable_path/Frameworks \
    -Wl,-sectcreate,__TEXT,__entitlements,"$WORK/host.entitlements" \
    -o "$APP/Host" "$HERE/Host.mm" 2>&1 | tee "$RESULTS/host-build.log"
if [ ! -x "$APP/Host" ]; then
    fail "the host app didn't build"
    exit 1
fi
codesign -f -s - "$APP/Frameworks/"*
codesign -f -s - --entitlements "$WORK/host.entitlements" "$APP"
echo "::endgroup::"

echo "::group::Simulator"
UDID=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
for runtime in sorted(devices, reverse=True):
    if "iOS" in runtime:
        for device in devices[runtime]:
            if device["name"].startswith("iPhone"):
                print(device["udid"]); sys.exit()')
echo "Device $UDID"
xcrun simctl boot "$UDID" 2> /dev/null
xcrun simctl bootstatus "$UDID" -b > /dev/null
xcrun simctl install "$UDID" "$APP" || { fail "the host app didn't install"; exit 1; }
DATA=$(xcrun simctl get_app_container "$UDID" "$APP_ID" data)
DOCS="$DATA/Documents"
CACHE="$DATA/Library/Caches/pyoncord"
xcrun simctl spawn "$UDID" sw_vers > "$RESULTS/simulator.txt" 2>&1
echo "::endgroup::"

python3 "$HERE/server.py" "$PORT" "$SERVE" "$RESULTS/server.log" < /dev/null > "$RESULTS/server-out.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2> /dev/null; xcrun simctl shutdown "$UDID" 2> /dev/null' EXIT
# Python can take a few seconds to start on a busy runner
for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:$PORT/__mode/normal" > /dev/null && break; sleep 1; done
mode() { curl -fs "http://127.0.0.1:$PORT/__mode/$1" > /dev/null || fail "the server didn't switch to $1"; }
clean_caches() { rm -rf "$CACHE"; }
clean_documents() { rm -rf "$DOCS"/*; }
json() { mkdir -p "$(dirname "$1")"; printf '%s' "$2" > "$1"; }

# Launches the host with a scenario and waits for it to finish, taking the screenshot it asks for
launch() {
    local name=$1 out="$RESULTS/$1.out" err="$RESULTS/$1.err"
    echo "::group::$name"
    xcrun simctl terminate "$UDID" "$APP_ID" 2> /dev/null
    : > "$out"
    SIMCTL_CHILD_ENDCORD_LOG_JS=1 SIMCTL_CHILD_OS_ACTIVITY_DT_MODE=1 xcrun simctl launch \
        --stdout="$out" --stderr="$err" "$UDID" "$APP_ID" "--scenario=$name" > /dev/null
    local shot=""
    for _ in $(seq 1 90); do
        if [ -z "$shot" ] && grep -q "^SCREENSHOT" "$out"; then
            xcrun simctl io "$UDID" screenshot "$RESULTS/$name.png" > /dev/null 2>&1
            shot=1
        fi
        grep -q "^DONE" "$out" && break
        sleep 1
    done
    sleep 1
    grep "^RESULT" "$out" | sed 's/^RESULT //'
    grep "^RESULT" "$out" | sed 's/^RESULT //' >> "$RESULTS/results.txt"
    grep -q "^DONE" "$out" || echo "FAIL $name finished: no DONE (it crashed or hung); see $name.err" | tee -a "$RESULTS/results.txt"
    grep -E "\[Endcord" "$err" | tail -n 40
    echo "::endgroup::"
}

: > "$RESULTS/results.txt"
THEME='{"id":"test-theme","selected":true,"data":{"name":"Test","spec":2,"semanticColors":{"BACKGROUND_PRIMARY":["#112233","#ffffff"],"TEXT_NORMAL":[false,"#000000"],"HEADER_PRIMARY":["#abc"],"BROKEN":"x"},"rawColors":{"PRIMARY_500":"#abcdef","alloc":"#ffffff","new":"#000000","colorWithRed:green:blue:alpha:":"#ffffff","blackColor":"#ff0000","WHITE_500":false}}}'

mode normal
clean_documents; clean_caches
launch first-start
launch cached-start
# The cached start asked with the saved ETag and was told nothing changed
grep -q "^/endcord.v$VERSION.hbc \"" "$RESULTS/server.log" && grep -q " 304$" "$RESULTS/server.log" \
    && pass "the saved bundle is checked with its ETag (304)" || fail "no request with the saved ETag"

cp "$WORK/hbc2.hbc" "$SERVE/endcord.v$VERSION.hbc"
launch update-old
launch update-new

mode nohbc; clean_caches
launch fallback-js
mode wronghbc; clean_caches
launch wrong-bytecode

mode normal; clean_caches; mkdir -p "$CACHE"
cp "$SERVE/other-version.hbc" "$CACHE/bundle.js"
printf 'http://127.0.0.1:%s/endcord.v%s.hbc\n"old"' "$PORT" "$VERSION" > "$CACHE/etag.txt"
launch saved-wrong-version

mode down; clean_caches; mkdir -p "$CACHE"
cp "$WORK/hbc2.hbc" "$CACHE/bundle.js.backup"
launch offline-backup
clean_caches
launch offline-nothing

mode normal
json "$DOCS/pyoncord/loader.json" "{\"customLoadUrl\":{\"enabled\":true,\"url\":\"http://127.0.0.1:$PORT/custom.js\"},\"loadReactDevTools\":true}"
launch custom-url
json "$DOCS/pyoncord/loader.json" "{\"customLoadUrl\":{\"enabled\":false,\"url\":\"http://127.0.0.1:$PORT/custom.js\"},\"loadReactDevTools\":true}"
launch custom-off

json "$DOCS/pyoncord/loader.json" '[1,2]'
json "$DOCS/pyoncord/current-theme.json" '"not a theme"'
json "$DOCS/pyoncord/fonts.json" "{\"name\":\"../../x\",\"main\":{\"../../../evil\":\"http://127.0.0.1:$PORT/evil.ttf\"}}"
json "$DOCS/vd_mmkv/VENDETTA_SETTINGS" '[]'
launch broken-files
json "$DOCS/pyoncord/fonts.json" "{\"name\":\"Bad\",\"main\":{\"ggsans-Normal\":\"http://127.0.0.1:$PORT/evil.ttf\",\"../evil\":\"http://127.0.0.1:$PORT/evil.ttf\"}}"
launch broken-files-2
[ -e "$DOCS/pyoncord/downloads/fonts/evil.ttf" ] && fail "a font name with .. wrote outside its folder" || pass "font names with .. are refused"

clean_documents
json "$DOCS/pyoncord/current-theme.json" "$THEME"
launch theme

clean_documents
FONT=$(ls /System/Library/Fonts/Supplemental/Herculanum.ttf 2> /dev/null || ls /System/Library/Fonts/Supplemental/*.ttf | head -n 1)
mkdir -p "$DOCS/pyoncord/downloads/fonts/Test"
cp "$FONT" "$DOCS/pyoncord/downloads/fonts/Test/ggsans-Normal.ttf"
[ "$(basename "$FONT")" = Herculanum.ttf ] && echo Herculanum > "$DOCS/expected-font.txt" \
    || echo "::warning::No Herculanum.ttf on this Mac; the font check compares against $(basename "$FONT")"
json "$DOCS/pyoncord/fonts.json" '{"spec":1,"name":"Test","main":{"ggsans-Normal":"https://example.com/font.ttf"}}'
launch fonts

clean_documents
mode throws; clean_caches
launch bundle-throws
mode real; clean_caches
launch real-bundle
mode normal

clean_documents
launch menu

clean_documents
launch smooth-caret
clean_documents
launch app-group
[ -e "$DOCS/AppGroup/marker.txt" ] && fail "the stand-in app group folder's files stayed" \
    || pass "the stand-in app group folder's files moved to the signed group"

clean_documents
json "$DOCS/pyoncord/plugins/settings.json" '{"x":{"enabled":true}}'
json "$DOCS/vd_mmkv/VENDETTA_PLUGINS" '{}'
json "$DOCS/vd_mmkv/VENDETTA_THEMES" "{\"test-theme\":$THEME}"
json "$DOCS/pyoncord/current-theme.json" "$THEME"
json "$DOCS/vd_mmkv/VENDETTA_SETTINGS" '{"developerSettings":true}'
launch delete-data
left=""
for f in pyoncord/plugins vd_mmkv/VENDETTA_PLUGINS vd_mmkv/VENDETTA_THEMES pyoncord/current-theme.json; do
    [ -e "$DOCS/$f" ] && left="$left $f"
done
[ -z "$left" ] && [ -f "$DOCS/vd_mmkv/VENDETTA_SETTINGS" ] \
    && pass "deleting plugins and themes removes what the bundle keeps them in, and only that" \
    || fail "deleting plugins and themes left:$left"

clean_documents
json "$DOCS/pyoncord/current-theme.json" "$THEME"
json "$DOCS/vd_mmkv/VENDETTA_THEMES" "{\"test-theme\":$THEME}"
json "$DOCS/vd_mmkv/VENDETTA_SETTINGS" '{"developerSettings":true}'
launch safe-mode-on
sleep 2
python3 - "$DOCS" <<'EOF' && pass "safe mode on: settings saved, theme off" || fail "safe mode on left the wrong files"
import json, sys
docs = sys.argv[1]
settings = json.load(open(f"{docs}/vd_mmkv/VENDETTA_SETTINGS"))
theme = json.load(open(f"{docs}/pyoncord/current-theme.json"))
print(settings, theme)
assert settings["safeMode"] == {"enabled": True, "currentThemeId": "test-theme"}, settings
assert settings["developerSettings"] is True
assert theme == {}, theme
EOF
launch safe-mode-off
sleep 2
python3 - "$DOCS" <<'EOF' && pass "safe mode off: theme back" || fail "safe mode off left the wrong files"
import json, sys
docs = sys.argv[1]
settings = json.load(open(f"{docs}/vd_mmkv/VENDETTA_SETTINGS"))
theme = json.load(open(f"{docs}/pyoncord/current-theme.json"))
print(settings, theme.get("id"))
assert settings["safeMode"]["enabled"] is False, settings
assert theme["id"] == "test-theme" and theme["selected"] is True, theme
EOF

xcrun simctl spawn "$UDID" log show --last 15m --style compact --predicate 'process == "Host"' > "$RESULTS/system.log" 2>&1

passed=$(grep -c "^PASS" "$RESULTS/results.txt")
failed=$(grep -c "^FAIL" "$RESULTS/results.txt")
echo "Host checks: $passed passed, $failed failed" | tee -a "$RESULTS/summary.txt"
grep "^FAIL" "$RESULTS/results.txt" >> "$RESULTS/summary.txt"
cat "$RESULTS/summary.txt"
[ "$failed" = 0 ] && ! grep -q "^FAIL" "$RESULTS/summary.txt"
