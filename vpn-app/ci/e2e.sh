#!/bin/bash
# End-to-end test on the Android emulator: import a config for the WireGuard server running on the build machine, connect, load a page through the tunnel.
set -x
APK=vpn-app/app/build/outputs/apk/debug/app-debug.apk
PKG=in.shazverse.srkvpn.debug
adb wait-for-device
adb install -r "$APK" || exit 1
adb shell appops set $PKG ACTIVATE_VPN allow
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb logcat -c
B64=$(base64 -w0 client.conf)
adb shell am start -n $PKG/in.shazverse.srkvpn.MainActivity -a in.shazverse.srkvpn.TEST --es conf "'$B64'" --es url http://10.66.66.1:8080/hello.txt
sleep 9
adb exec-out screencap -p > vpn-report/connected.png
for i in $(seq 1 60); do adb logcat -d -s SRKVPN_TEST:I | grep -q "DONE" && break; sleep 2; done
adb logcat -d -s SRKVPN_TEST:I > vpn-report/app-log.txt
adb logcat -d | grep -iE "wireguard|GoBackend|srkvpn|AndroidRuntime|FATAL" | tail -80 > vpn-report/logcat-tail.txt
sudo wg show > vpn-report/server-wg.txt
cat vpn-report/app-log.txt vpn-report/server-wg.txt
grep -q "DONE ok" vpn-report/app-log.txt
