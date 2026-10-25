# Durum (25 Ekim 2026)

Endcord for Android (yeni Discord), Revenge'in üç parçasının fork'udur: `bundle/` (Discord'un içinde çalışan
JavaScript), `loader/` (bundle'ı Discord'a yükleyen Xposed modülü) ve `installer/` (Discord'u indirip Endcord'u
ekleyen kurucu). Hangi upstream commit'lerinden alındığı `UPSTREAM.md` içinde.

## Çalışanlar (bu bilgisayarda doğrulandı)

- **Üç parça da derleniyor:** bundle `bun run build --build-minify` → `dist/endcord.min.js` (264 KB);
  loader JDK 25 ile `:app:assembleDebug` → 7 MB modül; installer JDK 21 ile `:app:assembleDebug` → 90 MB
  (debug; release derlemesi küçültülmüş olur).
- **Marka:** her yerde Endcord (uygulama adları, paket adları, ayar metinleri, hata diyalogları, "Endcord is
  ready!" günlükleri). Installer Endcord'un renk paleti ve simgesini kullanıyor.
- **Paket adları:** installer `com.endcord.installer.next`, yamalı Discord `com.endcord.next` (eski istemci
  `com.endcord` ile yan yana durur), modül `com.endcord.xposed`.
- **Güncelleme yolu:** loader bundle'ı `rootpoii/endcord-android` deposunun `builds` dalındaki
  `endcord.min.js`'den çekiyor (ETag önbelleği ile her açılışta), installer modülü aynı daldaki
  `endcord-xposed.apk`'den indiriyor ve `data.json` değişince önbelleğini yeniliyor; Discord güncellemesi
  kontrolü varsayılan 15 dakika. `.github/workflows/build.yml` her `main` push'unda bu dosyaları üretip
  `builds` dalına yazıyor.
- **Diller:** installer en/tr/ru/es/fr (152 metin × 4 dil çevrildi, `locales_config.xml` güncel).
- **Root modu:** loader, LSPosed modülü olarak gerçek Discord'u (`com.discord`) hedefliyor; bu Revenge'den
  olduğu gibi geliyor ve değiştirilmedi.
- **Emülatörde:** yeni installer açılıyor, Endcord görünümünde; Discord'un en yeni sürümünü (350.8 Stable)
  tracker'dan buluyor ve temel APK'yı indiriyor.

## Doğrulanamayanlar

- **Uçtan uca kurulum emülatörde tamamlanamadı:** Discord'un kütüphane paketi (`config.x86_64`) Google'ın
  Play CDN düğümünden iniyor ve bu ağdan o düğüme ne IPv4 ne IPv6 ile bağlanılabiliyor (bilgisayardan `curl`
  ile de aynı). Temel APK farklı bir düğümden indiği için inmişti. Bu installer'ın değil, bu ağın sorunu;
  başka bir ağda ya da gerçek telefonda tekrar denenmeli. Bu yüzden LSPatch ile yamalama, imzalama, kurulum
  ve **Endcord bundle'ının Discord içinde yüklendiği** henüz görülmedi.
- Şifreyle giriş: yeni Discord'un kendi giriş ekranı (captcha dahil) kullanılır; test edilmedi.
- Root/LSPosed modu: emülatörde root yok, denenmedi.
- Release imzalama: `LOADER_KEYSTORE*` ve `INSTALLER_KEYSTORE*` secret'ları eklenmeden CI debug imzalı
  modül yayınlar, installer sürümü ise hiç çıkmaz.

## Yapılan ek düzeltmeler

- Installer ve loader'ın HTTP istemcileri IPv4 adreslerini önce deniyor (IPv6'sı çalışmayan ağlarda
  dakikalarca beklemeyi önler).
- Loader'da bundle adresi, installer'da modül adresi derleme ayarı
  (`-Pendcord.bundleUrl=...`, `-Pendcord.loaderUrl=...`): geliştirirken bilgisayardan sunulan dosyalar
  kullanılabiliyor. Debug installer için cleartext HTTP açık.

## Sonraki adımlar

1. GitHub'da `rootpoii/endcord-android` deposunu aç, bu klasörü gönder, Actions'a yazma izni ver; ilk `Build`
   çalışınca `builds` dalı oluşur ve installer/loader gerçek adreslerden çalışır.
2. Kurulumu gerçek bir telefonda (ve başka ağda emülatörde) uçtan uca dene; bundle'ın yüklendiğini
   `adb logcat | grep -i endcord` ile gör ("Endcord is ready!").
3. İmza anahtarları oluşturup secret'ları ekle; ilk installer sürümünü `Release Installer` ile yayınla.
4. Eklentileri `docs/PLUGINS.md` sırasıyla taşımaya başla.
