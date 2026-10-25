#!/usr/bin/env bash
# Builds everything Endcord Installer and the in-app updater download, exactly like the CI "deploy" job,
# and commits it to a local `builds` branch so it can be pushed by hand:
#
#   scripts/prepare-builds.sh
#   git push origin builds
#
# Needs JAVA_HOME pointing to JDK 21 and local.properties pointing to the Android SDK.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

core_module="Endcord"

RELEASE=true ./gradlew --no-daemon --console=plain \
  ":$core_module:make" :Injector:make :kotlin-stdlib:make :patches:package

out="$root/build/builds"
rm -rf "$out"
mkdir -p "$out"
core_zip="$(ls "$core_module"/build/outputs/*.zip | head -1)"
cp "$core_zip" "$out/Endcord.zip"
cp Injector/build/outputs/Injector.dex "$out/"
cp patches/build/outputs/patches.zip "$out/"
cp kotlin-stdlib/build/outputs/kotlin.dex "$out/"

coreVersion="$(grep -E '^endcord.version=' gradle.properties | cut -d= -f2)"
injectorVersion="$(grep -E '^version = "' Injector/build.gradle.kts | cut -d '"' -f 2)"
patchesVersion="$(grep -E '^version = "' patches/build.gradle.kts | cut -d '"' -f 2)"
kotlinVersion="$(grep -E '^kotlin-stdlib = "' gradle/libs.versions.toml | cut -d '"' -f 2)"
changelog=""
[ -f .assets/changelog.md ] && changelog="$(cat .assets/changelog.md)"

node -e '
const fs = require("fs");
const [file, coreVersion, injectorVersion, patchesVersion, kotlinVersion, changelog, out] = process.argv.slice(1);
const data = JSON.parse(fs.readFileSync(file, "utf8"));
Object.assign(data, { coreVersion, injectorVersion, patchesVersion, kotlinVersion, changelog });
fs.writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
' .assets/data.json "$coreVersion" "$injectorVersion" "$patchesVersion" "$kotlinVersion" "$changelog" "$out/data.json"

# Commit the files to a `builds` branch without touching the current checkout
tmp_index="$(mktemp)"
export GIT_INDEX_FILE="$tmp_index"
rm -f "$tmp_index"
for f in "$out"/*; do
  blob="$(git hash-object -w "$f")"
  git update-index --add --cacheinfo 100644 "$blob" "$(basename "$f")"
done
tree="$(git write-tree)"
unset GIT_INDEX_FILE
rm -f "$tmp_index"

parent=()
git rev-parse -q --verify refs/heads/builds > /dev/null && parent=(-p builds)
commit="$(git commit-tree "$tree" "${parent[@]}" -m "Build $(git rev-parse --short HEAD) (Endcord $coreVersion)")"
git update-ref refs/heads/builds "$commit"

echo "builds branch updated: $commit"
ls -la "$out"
