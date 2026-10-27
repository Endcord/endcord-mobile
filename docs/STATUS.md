# Durum (27 Ekim 2026)

Endcord for Android (yeni Discord), Revenge'in üç parçasının fork'udur: `bundle/` (Discord'un içinde çalışan
JavaScript), `loader/` (bundle'ı Discord'a yükleyen Xposed modülü) ve `installer/` (Discord'u alıp Endcord'u ekleyen
kurucu). Hangi upstream commit'lerinden alındığı [UPSTREAM.md](../UPSTREAM.md) içinde.

## Bu sürümde

- **303 yerleşik eklenti**, Endcord PC'deki gibi her biri kendi klasöründe (`bundle/src/plugins/<eklenti>/`); Endcord
  PC'nin "popüler" 12 eklentisi dahil. Bir eklentinin kodu ancak açılınca yüklenir. Liste: [PLUGINS.md](PLUGINS.md).
- **Topluluk eklentileri:** topluluğun güncel tuttuğu listeden (Purple-EyeZ/Plugins-List) arama, kurma ve kaldırma;
  her eklentinin çalışıp çalışmadığı ve Endcord'da yerleşik karşılığı gösterilir.
- **NoTrack** varsayılan olarak açık: Discord'un analiz olayları, ölçümleri ve çökme raporları gönderilmez.
- **5 dil:** 2086 metnin tamamı Türkçe, Rusça, İspanyolca ve Fransızca; CI eksik çeviriyle derlemeyi durdurur.
- **Ayarlar:** yedekleme ve geri yükleme (sırlar yedeğe girmez), güncelleme denetimi, dil seçimi, `/reload`.
- **Temalar:** eski Discord için yazılmış temalar yeni renk adlarına eşlenir; durum çubuğu temanın açık/koyu oluşuna
  uyar.
- **Installer:** telefondaki Discord'dan ya da indirerek kurulum (orijinal Discord yerinde kalır), Endcord Classic
  seçeneği, küçük ekranlarda ve büyük yazıda kaydırma.
- **Loader:** Discord'un Hermes sürümüne göre önceden derlenmiş bayt kodu (v98, v99) yoksa düz JS; indirilmiş sürümle
  beklemeden açılış, güncelleme arka planda; Discord yeni bir Hermes'e geçince eski bayt kodu çalıştırılmaz; 5 dilli
  pencereler ve art arda çökmede kurtarma modu.

## Nasıl doğrulandı

- **CI** (her `ci/**` push'unda): tür denetimi, lint, çeviri denetimi, derleme ve bayt kodu.
- **Emülatör testi** (Android 14, Discord 351.11): installer iki yoldan da kullanıcı gibi kurar; Endcord'un öz-testi
  303 eklentinin her birini başlatıp durdurur, modül yollarını denetler, davranış testlerini çalıştırır ve Endcord
  sayfalarını İngilizce ve Türkçe çizer. Davranış testleri: MessageLogger, SilentTyping, ClearURLs, gönderim
  dönüşümlerinin sırası, SilentMessageToggle, metin komutları, gelen mesaj süzgeçleri, mesaj satırları, FakeNitro,
  HideEndcord, RelationshipNotifier ve oneko.
- **BlueStacks** (Android 9, Discord 350.8, giriş yapılmış test hesabı): eklenti denetimi (303 eklenti açılıp kapanır,
  sızıntı yok), açılış süresi, temalar ve durum çubuğu, Türkçe harfli düğmeler, topluluk eklentisi kurma ve kaldırma,
  NoTrack'in olayları gerçekten durdurduğu, HideEndcord.

## Bilinen sınırlamalar

- Eklentilerin çoğu giriş yapılmış bir hesapla tek tek denenmedi; açılıp kapanmaları ve kullandıkları Discord
  modülleri her sürümde doğrulanıyor. Sorun çıkaran eklenti kendini kapatır ve söyler; Discord çökmez.
- Paket adları (`app.revenge.manager`, `io.github.revenge.xposed`), `pyoncord/` veri klasörü ve `bunny.*` kimlikleri
  Revenge'den gelir. Var olan kurulumların verisi ve Vendetta/Bunny eklentileriyle uyum için değiştirilmedi.
- Vendetta eklentileriyle uyum için iki depolama sistemi yan yana çalışır.

## Yayın için

1. **İmza anahtarları:** installer ve loader anahtarlarını README'deki "Releasing" adımlarıyla GitHub Secrets'a ekle ve
   yedeğini al. Anahtar kaybolursa kullanıcılar Endcord'u silip yeniden kurmak zorunda kalır. Anahtarlar olmadan
   derlemeler geçici anahtarla imzalanır.
2. `release-prep` dalını `next`'e gönder; Build iş akışı `builds-next`'i günceller.
3. Actions → **Release Installer** → sürüm `1.0.0`.
