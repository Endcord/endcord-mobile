#!/usr/bin/env bash
# Runs the real iOS Discord on the simulator with the tweak and a --test bundle, so the bundle's self-test checks
# Endcord against Discord itself, logged out, as the Android emulator job does. A decrypted device build runs on an
# Apple silicon simulator once each binary says it's for the simulator. Nothing here is published.
#
#   real-discord.sh <decrypted Discord IPA> <Endcord.dylib built for the simulator> <bundle folder> <results folder>
#
# The tweak has to be built with ENDCORD_BUNDLE_URL=http://127.0.0.1:4040/endcord.min.js; the bundle folder holds
# endcord.min.js and endcord.v<bytecode>.hbc.
set -uo pipefail

IPA=$1
DYLIB=$2
SERVE=$(cd "$3" && pwd)
RESULTS=$(mkdir -p "$4" && cd "$4" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
PORT=4040

fail() { echo "::error::$*"; echo "FAIL: $*" >> "$RESULTS/summary.txt"; }
pass() { echo "PASS: $*" >> "$RESULTS/summary.txt"; }
: > "$RESULTS/summary.txt"

unzip -q "$IPA" -d "$WORK"
APP=$(echo "$WORK"/Payload/*.app)
APP_ID=$(plutil -extract CFBundleIdentifier raw "$APP/Info.plist")
SDK_VERSION=$(xcrun --sdk iphonesimulator --show-sdk-version)

# In place of whatever tweak the IPA has, or as one it loads
for tweak in "$APP"/Frameworks/*.dylib; do [ -f "$tweak" ] && cp "$DYLIB" "$tweak"; done
# The extensions can't run here, and need other entitlements
rm -rf "$APP/PlugIns" "$APP/Watch" "$APP/_CodeSignature"

plutil -replace CFBundleSupportedPlatforms -json '["iPhoneSimulator"]' "$APP/Info.plist"
find "$APP" -type f | while read -r file; do
    case "$(file -b "$file")" in
        *Mach-O*)
            [ "$(basename "$file")" = "$(basename "$(ls "$APP"/Frameworks/*.dylib | head -n 1)")" ] && continue
            xcrun vtool -arch arm64 -set-build-version iossim 16.0 "$SDK_VERSION" -replace -output "$file.new" "$file" \
                && mv "$file.new" "$file" || echo "::warning::vtool failed on $file"
            ;;
    esac
done
find "$APP/Frameworks" -maxdepth 2 \( -name '*.dylib' -o -name '*.framework' \) -print0 | xargs -0 -n 1 codesign -f -s - 2>&1 | tail -n 3
codesign -f -s - "$APP" 2>&1 | tail -n 3

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
xcrun simctl install "$UDID" "$APP" 2>&1 | tee "$RESULTS/install.log"
xcrun simctl spawn "$UDID" sw_vers > "$RESULTS/simulator.txt" 2>&1

python3 "$HERE/server.py" "$PORT" "$SERVE" "$RESULTS/server.log" < /dev/null > "$RESULTS/server-out.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2> /dev/null; xcrun simctl shutdown "$UDID" 2> /dev/null' EXIT
for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:$PORT/__mode/normal" > /dev/null && break; sleep 1; done

SIMCTL_CHILD_ENDCORD_LOG_JS=1 SIMCTL_CHILD_OS_ACTIVITY_DT_MODE=1 xcrun simctl launch \
    --stdout="$RESULTS/discord.out" --stderr="$RESULTS/discord.err" "$UDID" "$APP_ID" 2>&1 | tee "$RESULTS/launch.log"

# The self-test asks for a screenshot of each Endcord page it opens
taken=" "
for i in $(seq 1 900); do
    sleep 1
    for shot in $(grep -o '"kind":"shot","data":{"name":"[a-z-]*"' "$RESULTS/discord.err" 2> /dev/null | sed 's/.*"name":"//; s/"$//'); do
        case "$taken" in *" $shot "*) ;; *)
            xcrun simctl io "$UDID" screenshot "$RESULTS/page-$shot.png" > /dev/null 2>&1
            taken="$taken$shot "
            ;;
        esac
    done
    [ $((i % 60)) = 1 ] && xcrun simctl io "$UDID" screenshot "$RESULTS/discord-$i.png" > /dev/null 2>&1
    grep -q '"kind":"done"' "$RESULTS/discord.err" 2> /dev/null && break
    grep -q '"kind":"fatal"' "$RESULTS/discord.err" 2> /dev/null && break
    # A simulator's apps are processes of the Mac
    pgrep -x Discord > /dev/null || { echo "Discord isn't running after ${i}s" | tee -a "$RESULTS/summary.txt"; break; }
done
xcrun simctl io "$UDID" screenshot "$RESULTS/discord-final.png" > /dev/null 2>&1

# Each console line comes twice, from the tweak's forwarding and from Discord's own
grep -o 'ENDCORD_TEST .*' "$RESULTS/discord.err" | sed 's/^ENDCORD_TEST //' | awk '!seen[$0]++' > "$RESULTS/selftest.jsonl"
xcrun simctl spawn "$UDID" log show --last 15m --style compact --predicate 'process == "Discord"' 2> /dev/null \
    | tail -n 3000 > "$RESULTS/system.log"
find ~/Library/Logs/DiagnosticReports -name 'Discord*' -mmin -30 -exec cp {} "$RESULTS/" \; 2> /dev/null

python3 - "$RESULTS/selftest.jsonl" <<'EOF' | tee -a "$RESULTS/summary.txt"
import json, sys
started = stopped = 0
failed = []
done = False
for line in open(sys.argv[1], errors="replace"):
    try:
        row = json.loads(line)
    except ValueError:
        continue
    if row.get("kind") == "plugin":
        data = row["data"]
        started += bool(data.get("started"))
        stopped += bool(data.get("stopped"))
        if not data.get("started") or not data.get("stopped"):
            failed.append(f'{data.get("id")}: {str(data.get("error") or data.get("stopError"))[:200]}')
    elif row.get("kind") == "done":
        done = True
print(f"Plugins: {started} started, {stopped} stopped, {len(failed)} failed, self-test {'finished' if done else 'did NOT finish'}")
print("\n".join(failed))
EOF
[ -s "$RESULTS/selftest.jsonl" ] && pass "Endcord ran inside the real Discord" || fail "no self-test output"

# A second start: the saved bundle, checked with its ETag, and a theme, on Endcord's pages and in Discord's native colors
xcrun simctl terminate "$UDID" "$APP_ID" 2> /dev/null
DOCS="$(xcrun simctl get_app_container "$UDID" "$APP_ID" data)/Documents"
mkdir -p "$DOCS/pyoncord"
cat > "$DOCS/pyoncord/current-theme.json" <<'THEME'
{"id":"test-theme","selected":true,"data":{"name":"Test","spec":2,"semanticColors":{"BACKGROUND_BASE_LOWER":["#4a148c","#4a148c"],"BACKGROUND_BASE_LOW":["#4a148c","#4a148c"],"BACKGROUND_SURFACE_HIGH":["#6a1b9a","#6a1b9a"],"TEXT_DEFAULT":["#ffeb3b","#ffeb3b"],"TEXT_STRONG":["#ffeb3b","#ffeb3b"]},"rawColors":{}}}
THEME
SIMCTL_CHILD_ENDCORD_LOG_JS=1 SIMCTL_CHILD_OS_ACTIVITY_DT_MODE=1 xcrun simctl launch     --stdout="$RESULTS/discord2.out" --stderr="$RESULTS/discord2.err" "$UDID" "$APP_ID" 2>&1 | tee "$RESULTS/launch2.log"
for i in $(seq 1 300); do
    sleep 1
    if grep -q '"name":"en-general"' "$RESULTS/discord2.err" 2> /dev/null; then
        xcrun simctl io "$UDID" screenshot "$RESULTS/theme-general.png" > /dev/null 2>&1
        break
    fi
    pgrep -x Discord > /dev/null || { fail "Discord stopped on the second start after ${i}s"; break; }
done
grep -q ' 304 "$RESULTS/server.log" && pass "the second start checked the saved bundle with its ETag (304)"     || fail "no 304 on the second start"
grep -q 'test-theme' "$RESULTS/discord2.err" && echo "theme mentioned in the log" >> "$RESULTS/summary.txt"
grep -E '[Endcord]' "$RESULTS/discord2.err" | tail -n 30 > "$RESULTS/second-start.txt"
