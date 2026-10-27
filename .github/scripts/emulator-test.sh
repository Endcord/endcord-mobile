#!/usr/bin/env bash
# Runs inside the Android emulator job of .github/workflows/emulator.yml. Expects in the working directory:
#   serve/        endcord.min.js (built with --test), its endcord.v*.hbc and endcord-xposed.apk, served on port 4040
#                 (10.0.2.2 in the emulator)
#   installer.apk the debug installer, built to fetch the loader from serve/
# Writes screenshots, logs and the self-test report to results/.
set -uo pipefail

mkdir -p results
SCRIPTS="$(dirname "$0")"
INSTALLER_PKG=com.endcord.installer.next
ENDCORD_PKG=com.endcord.next
STATUS=0

step() { echo "::group::$*"; }
endstep() { echo "::endgroup::"; }
fail() { echo "::error::$*"; echo "FAIL: $*" >> results/summary.txt; STATUS=1; }
pass() { echo "PASS: $*" >> results/summary.txt; }

adb wait-for-device
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell getprop ro.build.version.release > results/android-version.txt
# Room for the whole self-test, which Discord's own logging would otherwise push out
adb logcat -G 16M

step "Serve the bundle and loader"
(cd serve && python3 -m http.server 4040 > ../results/http.log 2>&1 &)
sleep 2
curl -sf -o /dev/null http://127.0.0.1:4040/endcord.min.js && pass "bundle served" || fail "bundle not served"
endstep

launch_endcord() {
    local name=$1
    adb logcat -c
    adb shell monkey -p $ENDCORD_PKG -c android.intent.category.LAUNCHER 1 > /dev/null
    for i in 1 2 3 4 5 6; do
        sleep 10
        python3 "$SCRIPTS/ui.py" shot "$name-launch-$((i * 10))s"
    done
    # The self-test reports for up to six minutes after start; each "shot" line asks for a screenshot of the
    # page it shows, which stays up for a few seconds
    local taken=""
    for i in $(seq 1 200); do
        log=$(adb logcat -d 2>/dev/null)
        for shot in $(grep -o '"kind":"shot","data":{"name":"[a-z-]*"' <<<"$log" | sed 's/.*"name":"//; s/"$//'); do
            case " $taken " in *" $shot "*) ;; *)
                python3 "$SCRIPTS/ui.py" shot "$name-page-$shot"
                taken="$taken $shot"
            ;; esac
        done
        if grep -q '"kind":"done"' <<<"$log"; then break; fi
        # A crash ends the wait; there is nothing more to report
        if grep -q "FATAL EXCEPTION" <<<"$log" || ! adb shell pidof $ENDCORD_PKG > /dev/null; then break; fi
        sleep 2
    done
    adb logcat -d > "results/$name-logcat.txt"
    grep -o 'ENDCORD_TEST .*' "results/$name-logcat.txt" | sed 's/^ENDCORD_TEST //' > "results/$name-selftest.jsonl"
    grep -iE 'ReactNativeJS|Endcord|LSPatch|AndroidRuntime|FATAL' "results/$name-logcat.txt" > "results/$name-logcat-endcord.txt"
    python3 "$SCRIPTS/ui.py" shot "$name-final"
    if grep -q '"kind":"done"' "results/$name-selftest.jsonl"; then pass "$name: Endcord loaded and ran its self-test"; else fail "$name: no self-test report"; fi
    if grep -q "FATAL EXCEPTION" "results/$name-logcat.txt"; then fail "$name: the app crashed"; fi
    adb shell am force-stop $ENDCORD_PKG
}

step "Install Endcord Installer"
adb install -r -g installer.apk || fail "installer apk didn't install"
adb shell appops set $INSTALLER_PKG REQUEST_INSTALL_PACKAGES allow
adb shell appops set $INSTALLER_PKG MANAGE_EXTERNAL_STORAGE allow
adb shell dumpsys deviceidle whitelist +$INSTALLER_PKG
endstep

step "Scenario 1: install by downloading Discord"
adb shell am start -W -n $INSTALLER_PKG/app.revenge.manager.ui.activity.MainActivity
sleep 8
if python3 "$SCRIPTS/ui.py" install download; then
    pass "download: installer finished"
else
    fail "download: installer didn't finish"
fi
adb logcat -d > results/installer-download-logcat.txt
adb shell pm list packages | grep -q "$ENDCORD_PKG" && pass "download: Endcord installed" || fail "download: Endcord not installed"
adb shell am force-stop $INSTALLER_PKG
endstep

if adb shell pm list packages | grep -q "$ENDCORD_PKG"; then
    step "Launch Endcord (downloaded Discord)"
    launch_endcord download
    endstep
fi

step "Scenario 2: install over the Discord already on the phone"
adb uninstall $ENDCORD_PKG > /dev/null 2>&1
if [ -d discord ]; then
    adb install-multiple -r discord/*.apk && pass "stock Discord installed" || fail "stock Discord didn't install"
    adb shell am start -W -n $INSTALLER_PKG/app.revenge.manager.ui.activity.MainActivity
    sleep 8
    if python3 "$SCRIPTS/ui.py" install installed; then
        pass "installed: installer finished"
    else
        fail "installed: installer didn't finish"
    fi
    adb logcat -d > results/installer-installed-logcat.txt
    adb shell pm list packages | grep -q "$ENDCORD_PKG" && pass "installed: Endcord installed" || fail "installed: Endcord not installed"
    adb shell am force-stop $INSTALLER_PKG
    if adb shell pm list packages | grep -q "$ENDCORD_PKG"; then
        launch_endcord installed
        adb shell pm list packages | grep -q "^package:com.discord$" && pass "installed: stock Discord still installed" || fail "installed: stock Discord is gone"
    fi
fi
endstep

# The loader asks for the bundle precompiled for this Discord's bytecode version first, and the plain one without it
grep -oE '"GET /endcord[^ ]* HTTP/1\.[01]" [0-9]+' results/http.log | sort | uniq -c > results/bundle-requests.txt
if grep -qE '"GET /endcord\.v[0-9]+\.hbc HTTP/1\.[01]" 200' results/http.log; then
    pass "the bytecode bundle was loaded"
else
    fail "no bytecode bundle for this Discord: it ran the plain one"
fi

adb shell pm dump $ENDCORD_PKG | grep -E "versionName|versionCode" | head -4 > results/endcord-package.txt
cat results/summary.txt
exit $STATUS
