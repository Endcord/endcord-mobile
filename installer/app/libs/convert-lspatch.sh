# Download LSPatch (JingMatrix's maintained fork, which supports Android 14+) and convert it to an aar
# Jars cannot be used as a dependency without breaking R8 optimization

LSPATCH_URL="https://github.com/JingMatrix/LSPatch/releases/download/canary-492/lspatch-v1.2-492-release.jar"
LSPATCH_FILE_NAME="lspatch"

function cleanup {
  rm -rf $LSPATCH_FILE_NAME.jar META-INF AndroidManifest.xml classes.jar R.txt
}

cleanup

# download lspatch
curl -sSL -o $LSPATCH_FILE_NAME.jar $LSPATCH_URL

# The native libraries go into the app's assets: the Android Gradle plugin drops .so files from a jar's resources,
# and LSPatch reads them from assets/lspatch/so when it patches. They must come from the same build as the jar.
rm -rf ../src/main/assets/lspatch/so
unzip -q $LSPATCH_FILE_NAME.jar "assets/lspatch/so/*" -d ../src/main

# prepare aar contents
unzip -q $LSPATCH_FILE_NAME.jar "META-INF/**"
mv $LSPATCH_FILE_NAME.jar classes.jar
touch R.txt
cat >AndroidManifest.xml <<EOF
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="org.lsposed.lspatch">
    <uses-sdk android:minSdkVersion="28" android:targetSdkVersion="34" />
</manifest>
EOF

# add everything to aar
rm -f $LSPATCH_FILE_NAME.aar
zip -rq $LSPATCH_FILE_NAME.aar R.txt AndroidManifest.xml META-INF classes.jar
cleanup
