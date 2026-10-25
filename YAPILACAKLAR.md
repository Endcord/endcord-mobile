# Endcord mobile: senin yapman gerekenler

Bu dosya, gece boyunca hazırlanan Endcord mobile'ı yayına almak için **senin** yapman gereken adımları
sırasıyla anlatır. Kod tarafı hazır ve derleniyor. Ama telefonda hiç denenmedi, çünkü bu bilgisayarda bir
Android cihaz ya da emülatör yok. Aşağıdaki adımlarda test kısmı da var.

## 1. Bu klasördeki AGENTS.md

`AGENTS.md`, Aliucord'un orijinal deposundan geliyor ve "yapay zekâ ile yazılmış kod kabul edilmez" diyor. Bu,
Aliucord'a katkı göndermekle ilgili bir kural. Bu kod Aliucord'a gönderilmemeli. Kendi fork'un için bu
dosyayı kendi kuralınla değiştirmek ya da silmek sana kalmış. Ben dokunmadım.

## 2. GitHub deposunu aç

Uygulama, güncellemeleri ve dosyaları `rootpoii/endcord-mobile` deposundan indirecek şekilde ayarlandı
(`gradle.properties` içindeki `endcord.repository`). Başka bir ad kullanacaksan önce o satırı değiştir.

1. GitHub'da **rootpoii** hesabıyla `endcord-mobile` adında bir depo oluştur. Herkese açık olmalı, çünkü
   telefonlar dosyaları buradan indiriyor.
2. Depo **Settings → Actions → General → Workflow permissions** bölümünde **Read and write permissions**
   seçeneğini işaretle. Bu olmadan derleme, `builds` dalına dosya yükleyemez.
3. Bu klasörü depoya gönder:

   ```bash
   git remote add origin https://github.com/rootpoii/endcord-mobile.git
   git push -u origin main
   ```

4. Gönderdikten sonra **Actions** sekmesinde *Build* iş akışı çalışır ve `builds` dalını oluşturur. Bu dalda
   `Endcord.zip`, `Injector.dex`, `patches.zip`, `kotlin.dex` ve `data.json` bulunur. Installer ve uygulama
   bu dosyaları kullanır, o yüzden iş akışı yeşil olmadan kurulum çalışmaz.

   Beklemek istemezsen `builds` dalı bu bilgisayarda hazır (`scripts/prepare-builds.sh` ile üretildi). Onu
   doğrudan gönderebilirsin:

   ```bash
   git push origin builds
   ```

## 3. Installer için imza anahtarı

Installer'ın sürüm APK'sını imzalamak için bir anahtar oluşturuldu:
`C:\Users\ewlle\Documents\Endcord-signing\` (açıklama için klasördeki `README.txt`'ye bak).

- Bu klasörün **yedeğini al**. Anahtar kaybolursa kullanıcılar güncelleme yapamaz, uygulamayı silip yeniden
  kurmak zorunda kalır.
- GitHub deposunda **Settings → Secrets and variables → Actions** altına şu dört secret'ı ekle:
  `SIGNING_STORE_BASE64`, `SIGNING_STORE_PASSWORD`, `SIGNING_KEY_ALIAS`, `SIGNING_KEY_PASSWORD`.
  Değerler o klasördeki dosyalarda.

## 4. İlk installer sürümünü yayınla

Repoda **Actions → Build Installer → Run workflow** seç, sürüm olarak `1.0.0` yaz. İş akışı imzalı
`endcord-installer-v1.0.0.apk` dosyasını bir GitHub sürümü (release) olarak yayınlar. İnsanlar bu APK'yı
indirip kurar. Bu bilgisayarda aynı anahtarla imzalanmış bir kopyası da var: `dist/` klasörü.

## 5. Telefonda test et

Yayına almadan önce mutlaka bir telefonda dene:

1. Installer'ı kur, dili seç, izinleri ver, **New Install** ile Endcord'u kur.
2. Endcord açılınca Discord hesabına gir. **Ayarlar → Endcord** bölümünde dil seçimini, **Eklentiler**
   sayfasını (toplam/etkin sayıları, filtreler) ve **Güncelleyici**'yi dene.
3. Birkaç eklentiyi aç ve çalıştığını kontrol et. Her eklentinin mobilde ne yaptığı `docs/plugins/`
   klasöründe yazıyor. Eklentiler gerçek Discord sınıflarına göre yazıldı ama hiçbiri cihazda denenmedi;
   hata görürsen **Ayarlar → Endcord → Çökmeler** sayfası ve `Endcord/crashlogs` klasörü yardımcı olur.

## 6. Güncelleme yayınlama (sonrası için)

- Uygulama güncellemesi: `gradle.properties` içinde `endcord.version` değerini artır (ör. `1.0.1`), istersen
  sürüm notlarını `.assets/changelog.md` dosyasına yaz ve `main`'e gönder. Açık olan her Endcord 15 dakika
  içinde "Endcord güncellendi" bildirimini gösterir ve tek dokunuşla güncellenir.
- Installer güncellemesi: *Build Installer* iş akışını yeni bir sürüm numarasıyla çalıştır.

## 7. Durum özeti

- **487 PC eklentisinin hepsi** `docs/plugins/` içinde tek tek ele alındı: 122'si tam taşındı, 114'ü mobilde
  yapılabildiği kadarıyla (Partial), 176'sı mobilde anlamsız (Not applicable, gerekçesiyle), 75'i bilerek
  atlandı (Skipped, gerekçesiyle).
- **Çeviriler:** 1913 metin; Türkçe, Rusça, İspanyolca ve Fransızca'da eksik yok. İngilizce varsayılan.
- **Hata taraması:** yayın öncesinde dört ayrı inceleme bütün eklentileri gerçek Discord sınıflarına karşı
  kontrol etti. Bulunan çökme, sızıntı, rate-limit ve yanlış davranış hatalarının hepsi düzeltildi
  (ayrıntılar `docs/PORTING.md` içindeki "Lessons from the pre-release review" bölümünde).
- **Telefonda denenmedi.** 5. adımdaki testi atlama. Özellikle şu eklentileri dene: MessageLogger,
  ScheduledMessages, SilentDelete, AntiMoveDeco, FollowUser, VoiceRejoin, FakeMute/FakeDeafen,
  ChannelWallpaper, ServerPinner, DmReadReceipt.

## 8. Bilmen gereken kararlar

- **Java paket adları `com.aliucord` olarak kaldı.** Bunlar kullanıcıya görünmez. Değiştirilseydi mevcut
  Aliucord eklentilerinin hepsi bozulurdu. Görünen her yer (uygulama adı, klasör `/Endcord`, ayarlar, bağlantılar,
  installer) Endcord oldu.
- **Discord APK'sı ve Aliuhook kütüphanesi** hâlâ Aliucord'un sunucusundan (`maven.aliucord.com`) indiriliyor,
  çünkü bunlar Endcord'a özel değil. Kendi sunucuna taşımak istersen installer'daki `MAVEN_URL` değişir.
- Bazı PC eklentileri bilerek taşınmadı: AntiSoap (nefret içeriği), SpotifyCrack (ücretli özelliği atlatma),
  PullUserIntoVoice (taciz aracı). Masaüstüne özel olanlar "Not applicable" olarak `docs/plugins/` içinde
  gerekçesiyle listelendi.
- **Gizli ayarlar:** ChatGPT eklentisinin OpenAI anahtarı gibi değerler `/sdcard/Endcord` yerine uygulamanın
  özel deposunda tutuluyor ve yedeğe girmiyor. Yedekten geri yükleyen kullanıcı anahtarı yeniden girmeli.
- Çekirdek modülün klasörü artık `Endcord/` (eskiden `Aliucord/`).
