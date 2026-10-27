#!/usr/bin/env python3
"""Drives the emulator like a user: finds on-screen text through uiautomator, taps it and takes screenshots.

Used by emulator-test.sh. Every step is logged, so a failed run shows how far the user got.
"""

import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

OUT = "results"


def adb(*args, check=True, capture=True):
    result = subprocess.run(["adb", *args], capture_output=capture, timeout=120)
    if check and result.returncode != 0:
        raise RuntimeError(f"adb {' '.join(args)} failed: {result.stderr.decode(errors='replace')}")
    return result.stdout


def log(msg):
    print(f"[ui {time.strftime('%H:%M:%S')}] {msg}", flush=True)


def nodes():
    """All nodes on screen with their text, content description and center point."""
    for _ in range(3):
        raw = adb("exec-out", "uiautomator", "dump", "/dev/tty", check=False)
        text = raw.decode("utf-8", errors="replace")
        start, end = text.find("<?xml"), text.rfind(">")
        if start == -1:
            time.sleep(1)
            continue
        try:
            root = ET.fromstring(text[start:end + 1])
        except ET.ParseError:
            time.sleep(1)
            continue
        out = []
        for n in root.iter("node"):
            bounds = re.findall(r"\d+", n.get("bounds", ""))
            if len(bounds) != 4:
                continue
            x1, y1, x2, y2 = map(int, bounds)
            out.append({
                "text": n.get("text", ""),
                "desc": n.get("content-desc", ""),
                "id": n.get("resource-id", ""),
                "clickable": n.get("clickable") == "true",
                "enabled": n.get("enabled") == "true",
                "x": (x1 + x2) // 2,
                "y": (y1 + y2) // 2,
            })
        return out
    return []


def find(pattern, among=None):
    regex = re.compile(pattern, re.I)
    for n in among if among is not None else nodes():
        if regex.fullmatch(n["text"].strip()) or regex.fullmatch(n["desc"].strip()) or (n["id"] and regex.fullmatch(n["id"])):
            return n
    return None


def screen_text():
    return [n["text"] or n["desc"] for n in nodes() if n["text"] or n["desc"]]


def scroll_down():
    """Swipes the page up by half a screen, as a user does to reach what's below it."""
    size = re.search(rb"(\d+)x(\d+)", adb("shell", "wm", "size"))
    width, height = int(size.group(1)), int(size.group(2))
    adb("shell", "input", "swipe", str(width // 2), str(height * 3 // 4), str(width // 2), str(height // 4), "400")


def wait_for(pattern, timeout=60, interval=2, scroll=False):
    """The first node matching the pattern, waiting for it to appear; with scroll, also looking further down the page."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        n = find(pattern)
        if n:
            return n
        if scroll:
            scroll_down()
        time.sleep(interval)
    return None


def tap(node):
    adb("shell", "input", "tap", str(node["x"]), str(node["y"]))


def tap_text(pattern, timeout=60, scroll=False):
    n = wait_for(pattern, timeout, scroll=scroll)
    if not n:
        log(f"not found: {pattern}; on screen: {screen_text()[:40]}")
        return False
    log(f"tap '{n['text'] or n['desc']}'")
    tap(n)
    return True


def screenshot(name):
    with open(f"{OUT}/{name}.png", "wb") as f:
        f.write(adb("exec-out", "screencap", "-p"))
    with open(f"{OUT}/{name}.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(screen_text()))
    log(f"screenshot {name}")


def dismiss_dialogs():
    """Taps through the installer's first-run dialogs and Android's prompts, whichever appear."""
    for _ in range(4):
        all_nodes = nodes()
        for pattern in [r"Later", r"No thanks", r"Nevermind", r"Allow", r"While using the app", r"OK"]:
            n = find(pattern, all_nodes)
            if n and n["clickable"] is not None:
                log(f"dismiss '{n['text']}'")
                tap(n)
                time.sleep(1.5)
                break
        else:
            return


def install_flow(source):
    """Endcord Installer from its home screen to an installed Endcord."""
    screenshot(f"installer-{source}-0-home")
    dismiss_dialogs()
    if source == "installed":
        if not tap_text(r"Use the Discord on this phone", 30):
            return False
    elif source == "download":
        tap_text(r".*Download Discord.*", 10)
    screenshot(f"installer-{source}-1-source")
    # On a short screen the button is further down the page
    if not tap_text(r"(Install|Reinstall|Update)", 120, scroll=True):
        return False
    deadline = time.time() + 900
    shot = 2
    while time.time() < deadline:
        all_nodes = nodes()
        confirm = find(r"(INSTALL|Install|UPDATE|Update)", [n for n in all_nodes if "packageinstaller" in n["id"] or n["id"].startswith("android:id/button")])
        if confirm:
            screenshot(f"installer-{source}-{shot}-confirm")
            shot += 1
            log("confirming the system install prompt")
            tap(confirm)
            time.sleep(3)
            continue
        # Android asks once to allow installs from the installer, like it does for a real user
        if find(r".*install unknown apps.*", all_nodes):
            screenshot(f"installer-{source}-{shot}-unknown-sources")
            shot += 1
            tap_text(r"Settings", 10)
            if tap_text(r"Allow from this source", 15):
                time.sleep(1)
            adb("shell", "input", "keyevent", "KEYCODE_BACK")
            time.sleep(3)
            continue
        if find(r"Installed successfully|.*successfully.*", all_nodes) or find(r"Launch", all_nodes):
            screenshot(f"installer-{source}-{shot}-done")
            return True
        if find(r".*(Failed|failed|error).*", all_nodes):
            screenshot(f"installer-{source}-{shot}-failed")
            return False
        time.sleep(3)
    screenshot(f"installer-{source}-timeout")
    return False


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "install":
        sys.exit(0 if install_flow(sys.argv[2]) else 1)
    elif cmd == "shot":
        screenshot(sys.argv[2])
    elif cmd == "tap":
        sys.exit(0 if tap_text(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 30) else 1)
    elif cmd == "dismiss":
        dismiss_dialogs()
