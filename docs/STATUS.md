# Durum (26 Ekim 2026, sabah)

Endcord for Android (yeni Discord), Revenge'in üç parçasının fork'udur: `bundle/` (Discord'un içinde çalışan
JavaScript), `loader/` (bundle'ı Discord'a yükleyen Xposed modülü) ve `installer/` (Discord'u alıp Endcord'u ekleyen
kurucu). Hangi upstream commit'lerinden alındığı `UPSTREAM.md` içinde.

## Bu gece yapılanlar

### Eklentiler
- Endcord PC'deki **"popüler" etiketli 12 eklentinin hepsi** mobile yazıldı (`bundle/src/plugins/`): CustomProfile,
  MessageLogger, HideEndcord, FakeNitro, SmoothType, ViewIcons, ThemeLibrary, oneko, PlatformIndicators,
  RelationshipNotifier, SilentTyping, FakeMute. Ek olarak ClearURLs. Ayrıntılar ve PC'den farkları:
  [PLUGINS.md](PLUGINS.md).
- Eklenti sayfası: Endcord eklentileri listede, popülerler en üstte ve "POPÜLER" etiketli (PC'deki gibi); her
  eklentinin şemadan üretilen ayar sayfası var ve eklenti açılmadan da ayarlanabiliyor.
- Eklenti çatısı (`api.ts`): başlarken hata veren eklenti kendini kapatır ve kullanıcıya söyler, Discord çökmez; her
  yama `cleanup` ile kaydedilir, kapatınca hepsi geri alınır.
- Bütün eklentilerin kullandığı Discord tanımlayıcıları ve modül yolları Discord 350.8'in (en yeni kararlı sürüm)
  bytecode'unda tek tek doğrulandı.

### Diller
- Endcord PC'nin çevirileri `bun run i18n` ile bundle'a alınıyor; PC'de olmayan mobil metinler
  `bundle/src/core/i18n/overrides.json` içinde. **321 metnin hepsi Türkçe, Rusça, İspanyolca ve Fransızca'da var**;
  CI eksik çeviri olursa derlemeyi durdurur.
- Endcord Discord'un dilini izler; Endcord → Genel'den elle de seçilebilir.
- Önemli düzeltme: eski çeviri sistemi Discord'un artık göndermediği bir olaya (`I18N_LOAD_SUCCESS`) bağlıydı ve
  Bunny'nin deposundan çeviri indiriyordu; yani bu Discord sürümünde hiç çalışmıyordu.
- Loader'ın kendi pencereleri (güncelleme, kurtarma, hata) de 5 dilde.

### Installer: telefondaki Discord'dan kurulum
- Discord telefonda yüklüyse installer **"Bu telefondaki Discord'u kullan"** seçeneğiyle açılır: yüklü Discord'un
  APK'ları kopyalanır, Endcord eklenir ve "Endcord" olarak yanına kurulur. İstenirse "Discord'u indir" de seçilebilir.
- Neden Discord'un kendisi değiştirilemiyor: Android bir uygulamayı yalnızca onu imzalayanın güncellemesine izin
  verir, Discord'un imza anahtarı da Discord'da. Masaüstündeki gibi gerçek Discord'un içine kurulum yalnızca root ile
  (LSPosed) mümkün; bu mod da destekleniyor (README).
- Play Store Discord'u güncellediğinde installer bildirim gösterir ve Endcord'u yeni sürümden yeniden kurar.

### Düzeltilen hatalar ve amatör görünen şeyler
- CI: `builds-next` dalına yayın adımı her seferinde başarısız oluyordu (yeni sürüm hiç yayınlanmıyordu). Düzeltildi.
- Installer açılışta kapatılamayan bir **"Tüm dosyalara erişim"** izni istiyordu ve bu izinle `/sdcard/Endcord`
  içindeki imza anahtarını kendi klasörüne taşıyordu; klasik Endcord'un anahtarı oradaysa iki uygulamanın da
  güncellemeleri bozulurdu. İzin, pencere ve taşıma kaldırıldı.
- Installer'ın güncelleme denetçisi kurulu Endcord sürümünü bir kez okuyup hep onu kullanıyordu; düzeltildi.
- Installer'ın ana ekranındaki commit listesi klasik istemcinin commit'lerini gösteriyordu; artık `next`.
- Yayın derlemeleri geliştirici modunda (`__DEV__`) derleniyordu; düzeltildi.
- Loader, internet yokken her açılışta engelleyici bir hata penceresi gösteriyordu (önbellekte çalışan sürüm olsa
  bile) ve pencerede "Revenge" yazıyordu; artık yalnızca hiç indirilmiş sürüm yoksa gösteriyor.
- Endcord ayarlarındaki simge Revenge'in logosuydu; Endcord'un logosu konuldu. Bağlantılar Revenge'in GitHub'ına ve
  Discord sunucusuna gidiyordu; Endcord'unkilere çevrildi.
- Eklenti bilgi sayfasında hiçbir şey yapmayan menü öğeleri ve düğmeler vardı; gerçek işlemlerle yeniden yazıldı.
  Yazarı olmayan eklentilerde çökme riski taşıyan yazar listesi düzeltildi.
- Discord ayarlarında boş "Bunny" ve "Vendetta" bölüm başlıkları çıkabiliyordu; boş bölümler artık gösterilmiyor.
- Çökme ekranı, sıralama, boş liste, tema ve yazı tipi sayfalarındaki İngilizce ve "Oops!/Uh Oh" gibi metinler
  düzgün ifadelerle değiştirilip çevrildi.

### Test altyapısı
- `Emulator test` iş akışı (`.github/workflows/emulator.yml`): GitHub'ın KVM'li Android 14 emülatöründe installer'ı
  kurar, düğmelere kullanıcı gibi basarak iki senaryoyu dener (Discord'u indirerek ve önceden yüklü Discord'dan),
  Endcord'u açar, bundle'ın içindeki öz-testi çalıştırır (her eklentiyi Discord 350.8'de başlatıp durdurur, modül
  yollarını kontrol eder, Endcord sayfalarını İngilizce ve Türkçe çizer) ve ekran görüntülerini, logları
  `test-results/<dal>` dalına yükler.
- Bu bilgisayarda emülatör çalışamıyor: işlemcide sanallaştırma açık ama Windows'un hipervizörü (WHPX) kapalı ve
  açmak yönetici izni ile yeniden başlatma istiyor. Testler bu yüzden GitHub'da koşuyor.

## Test sonuçları

Emülatör testleri (GitHub Actions, Android 11 / 14 / 15, Discord 350.8 Stable) şunları buldu ve düzeltti:

1. **Android 14 ve üstünde Endcord açılır açılmaz çöküyordu.** Installer'daki LSPatch, 2025 başından kalma bir
   kopyaydı (Revenge Manager'da da aynısı var) ve Discord 350.8'in yeni `TTIComponentFactory` sınıfıyla, Android 14'ün
   kod yükleme kısıtlamalarıyla baş edemiyordu. LSPatch, bakımı süren JingMatrix çatalının güncel sürümüne
   (v1.2, canary 492) yükseltildi; installer'ın yamalama kodu yeni API'ye taşındı.
2. **Installer, LSPatch'in yerel kütüphanelerini kendi `assets` klasöründen alıyordu**; yeni LSPatch'in Java kısmıyla eski
   yerel kütüphaneler karışınca kanca altyapısı başlamıyordu. Kütüphaneler yeni sürümden alındı ve
   `convert-lspatch.sh` artık ikisini birlikte günceller.
3. **Kurulum iki yoldan da çalışıyor:** Discord'u indirerek ve telefondaki Discord'dan (orijinal Discord yerinde kalıyor).
   Android 15'te sistemin "bilinmeyen kaynaklar" izni bir kez soruluyor; bu Android'in normal akışı.

TEST_RESULTS_LATEST

## Doğrulanamayanlar (giriş yapmak gerekiyor)

Emülatörde Discord hesabıyla giriş yapılamıyor (hesap açmak ve şifre/token girmek benim yapamayacağım şeyler).
Bu yüzden sohbet ekranına bağlı davranışlar gerçek kullanımda denenmedi: silinen mesajın kırmızı görünmesi,
düzenleme geçmişi, FakeNitro'nun gönderdiği bağlantılar, profil görsellerine dokunma, platform simgeleri, sohbet
çubuğu düğmeleri, sahte susturmanın sesli kanalda karşı tarafa nasıl göründüğü. Bunların hepsinin kullandığı
Discord modülleri ve alanları 350.8'de doğrulandı ve her eklenti emülatörde hatasız başlayıp duruyor; ama son
kontrolü telefonda giriş yapıp senin yapman gerekiyor (aşağıdaki liste).

## Senin yapman gerekenler

1. **İmza anahtarları:** `C:\Users\qwe\Documents\Endcord-signing\` klasöründe installer ve loader için anahtarlar
   hazır. `github-secrets.txt` dosyasındaki 8 değeri GitHub'da **Settings → Secrets and variables → Actions**
   altına ekle (`*_KEYSTORE` değerleri için `.base64.txt` dosyalarının içeriğini yapıştır). Klasörün yedeğini al:
   anahtar kaybolursa kullanıcılar Endcord'u silip yeniden kurmak zorunda kalır.
2. **Yayına alma:** Çalışma `overnight` dalında, `next`'e henüz gönderilmedi. Gözden geçirdikten sonra:
   `git push origin overnight:next`. Build iş akışı `builds-next` dalını günceller.
3. **İlk installer sürümü:** Actions → **Release Installer** → Run workflow, sürüm `1.0.0`.
4. **Telefonda deneme listesi** (giriş yaptıktan sonra, Ayarlar → Endcord → Eklentiler):
   - MessageLogger'ı aç; bir arkadaşından mesaj atıp silmesini iste: mesaj kırmızı ve "silindi" yazısıyla kalmalı.
     Düzenlenen mesajda eski hâli üstte görünmeli.
   - FakeNitro: kullanamadığın bir sunucu emojisini gönder; bağlantı olarak gitmeli ve görsel olarak görünmeli.
   - ViewIcons: bir profilde avatara ve afişe dokun; tam boyut açılmalı.
   - SilentTyping: başka bir hesaptan bakınca "yazıyor..." görünmemeli. Sohbet düğmesi ayarını dene.
   - FakeMute: sesli kanalda sahte susturmayı aç; diğerleri seni susturulmuş görmeli ama duymalı.
   - PlatformIndicators: mesaj saatinin yanında 🖥️📱🌐 simgeleri.
   - CustomProfile, oneko, ThemeLibrary (bir tema yükle), HideEndcord (`/hideendcord`), RelationshipNotifier.
   - Dil: Endcord → Genel → Dil; Türkçe seçince bütün Endcord ekranları Türkçe olmalı.
5. Bir şey çalışmazsa: eklenti kendini kapatıp bildirir. Kurtarma menüsü için telefonu salla veya Endcord açılır açılmaz ekrana iki parmakla 3 saniye bas (
   yeniden yükleme, kurtarma modu); ayrıntı için logcat'te `Endcord` satırları.
