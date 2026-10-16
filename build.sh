#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_SDK_ROOT:?Set ANDROID_SDK_ROOT to an Android SDK with platform 35 and build-tools 35.0.0}"
: "${ECJ_JAR:?Set ECJ_JAR to Eclipse ecj-3.38.0.jar}"
BT="$ANDROID_SDK_ROOT/build-tools/35.0.0"
ANDROID_JAR="$ANDROID_SDK_ROOT/platforms/android-35/android.jar"
rm -rf build
mkdir -p build/classes build/dex build/gen dist signing
"$BT/aapt2" compile --dir res -o build/resources.zip
"$BT/aapt2" link -o build/base.apk -I "$ANDROID_JAR" --manifest AndroidManifest.xml -A assets --java build/gen build/resources.zip
java -jar "$ECJ_JAR" -1.8 -proc:none -nowarn -bootclasspath "$ANDROID_JAR:$BT/core-lambda-stubs.jar" -classpath "$ANDROID_JAR" -d build/classes src/com/adfree/reader/*.java
mapfile -t classes < <(find build/classes -name '*.class' -type f)
if [ -n "${D8_JAR:-}" ]; then
    java -Xmx1G -cp "$D8_JAR" com.android.tools.r8.D8 --lib "$ANDROID_JAR" --min-api 26 --output build/dex "${classes[@]}"
else
    "$BT/d8" --lib "$ANDROID_JAR" --min-api 26 --output build/dex "${classes[@]}"
fi
python3 - <<'PY'
import zipfile, shutil
shutil.copyfile('build/base.apk', 'build/unsigned.apk')
with zipfile.ZipFile('build/unsigned.apk', 'a', zipfile.ZIP_DEFLATED) as archive:
    archive.write('build/dex/classes.dex', 'classes.dex')
PY
"$BT/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk
if [ ! -f signing/release.p12 ]; then
    python3 - <<'PY'
import secrets, pathlib
p = pathlib.Path('signing/password.txt')
p.write_text(secrets.token_urlsafe(32))
p.chmod(0o600)
PY
    keytool -genkeypair -keystore signing/release.p12 -storetype PKCS12 -storepass:file signing/password.txt -alias yereader -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=Ye Reader, OU=Applications, O=AdFreeApps" >/dev/null 2>&1
    chmod 600 signing/release.p12
fi
"$BT/apksigner" sign --ks signing/release.p12 --ks-pass file:signing/password.txt --ks-key-alias yereader --out dist/YeReader-v1.0.0.apk build/aligned.apk
"$BT/apksigner" verify --verbose dist/YeReader-v1.0.0.apk
"$BT/aapt2" dump badging dist/YeReader-v1.0.0.apk
