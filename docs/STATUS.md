# Durum (25 Ekim 2026, akşam)

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
- **Güncelleme yolu:** loader bundle'ı `rootpoii/endcord-mobile` deposunun `builds-next` dalındaki
  `endcord.min.js`'den çekiyor (ETag önbelleği ile her açılışta), installer modülü aynı daldaki
  `endcord-xposed.apk`'den indiriyor ve `data.json` değişince önbelleğini yeniliyor; Discord güncellemesi
  kontrolü varsayılan 15 dakika. `.github/workflows/build.yml` her `main` push'unda bu dosyaları üretip
  `builds` dalına yazıyor.
- **Diller:** installer en/tr/ru/es/fr (152 metin × 4 dil çevrildi, `locales_config.xml` güncel).
- **Root modu:** loader, LSPosed modülü olarak gerçek Discord'u (`com.discord`) hedefliyor; bu Revenge'den
  olduğu gibi geliyor ve değiştirilmedi.
- **Emülatörde:** yeni installer açılıyor, Endcord görünümünde; Discord'un en yeni sürümünü (350.8 Stable)
  tracker'dan buluyor ve temel APK'yı indiriyor.

## Emülatörde uçtan uca kurulum (başarılı)

Android 11 x86_64 emülatöründe, bu bilgisayardan sunulan bir yansı ile (`-Pendcord.mirrorUrl`, çünkü bu ağdan
Google'ın Play CDN düğümüne ulaşılamıyor; ayrıntı aşağıda):

1. Installer Discord 350.8 Stable'ın dört paketini indirdi, Endcord Xposed modülünü LSPatch ile içine gömdü,
   imzaladı ve `com.endcord.next` olarak kurdu (indirme 20 s, yamalama 30 s, kurulum 2 s).
2. Uygulama açıldı; kayıtlarda LSPatch modülü yüklüyor, `Discord loaded with version: 350.8`, 10 dahili eklenti
   hatasız başlıyor, bundle `endcord.min.js` indiriliyor ("Bundle updated (263980 bytes)") ve Discord'un kendi
   JavaScript'inden önce yükleniyor ("Loading downloaded bundle"). JavaScript tarafında hata yok.
3. Discord'un karşılama ekranı geldi. Endcord'un ayar sayfası giriş yaptıktan sonra görünür; emülatörde hesapla
   giriş yapılmadığı için **arayüz tarafı henüz gözle doğrulanmadı**.

## Doğrulanamayanlar

- Endcord ayar sayfası ve eklenti listesi (giriş gerektirir).
- Gerçek telefonda, yani public tracker yansısıyla kurulum: bu ağda Google'ın bazı CDN düğümleri hem IPv4 hem
  IPv6 ile erişilemez olduğu için paketler bilgisayardan `curl` ile Google'ın yedek düğümünden alındı ve
  `bundle/dist/tracker/...` altından sunuldu. Bu installer'ın değil, bu ağın sorunu.
- Şifreyle giriş: yeni Discord'un kendi giriş ekranı (captcha dahil) kullanılır; test edilmedi.
- Root/LSPosed modu: emülatörde root yok, denenmedi.
- Release imzalama: `LOADER_KEYSTORE*` ve `INSTALLER_KEYSTORE*` secret'ları eklenmeden CI debug imzalı
  modül yayınlar, installer sürümü ise hiç çıkmaz.

## Yapılan ek düzeltmeler

- Installer ve loader'ın HTTP istemcileri IPv4 adreslerini önce deniyor (IPv6'sı çalışmayan ağlarda
  dakikalarca beklemeyi önler).
- Loader'da bundle adresi, installer'da modül ve yansı adresi derleme ayarı (`-Pendcord.bundleUrl=...`,
  `-Pendcord.loaderUrl=...`, `-Pendcord.mirrorUrl=...`): geliştirirken bilgisayardan sunulan dosyalar
  kullanılabiliyor. Debug installer için cleartext HTTP açık.

## Sonraki adımlar

1. Bu proje `rootpoii/endcord-mobile` deposunun `next` dalında yaşar; her push'ta `Build` iş akışı `builds-next`
   dalını üretir ve installer/loader gerçek adreslerden çalışır.
2. Kurulumu gerçek bir telefonda (ve başka ağda emülatörde) uçtan uca dene; bundle'ın yüklendiğini
   `adb logcat | grep -i endcord` ile gör ("Endcord is ready!").
3. İmza anahtarları oluşturup secret'ları ekle; ilk installer sürümünü `Release Installer` ile yayınla.
4. Eklentileri `docs/PLUGINS.md` sırasıyla taşımaya başla.
