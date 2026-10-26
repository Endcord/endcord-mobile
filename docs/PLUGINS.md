# Eklentiler (Endcord PC → Endcord for Android)

Endcord'un mobil eklentileri `bundle/src/plugins/` altında yaşar ve uygulamayla birlikte gelir. Hepsi kapalı başlar;
kullanıcı **Ayarlar → Endcord → Eklentiler** sayfasından açar. Popüler olanlar, Endcord PC'deki sırayla en üstte ve
"POPÜLER" etiketiyle görünür.

## Taşınanlar (Endcord PC'nin "popüler" listesinin tamamı)

| Sıra | Eklenti | Mobilde ne yapıyor | PC'den farkı |
| --- | --- | --- | --- |
| 1 | CustomProfile | Kendi avatarınız, afişiniz, görünen adınız, hakkımda ve zamirleriniz; yalnızca size görünür | Rozet ve Nitro taklidi yok (yalnızca sahte ekran görüntüsüne yarar); görünen ad şimdilik yalnızca mesajlarda değişiyor |
| 2 | MessageLogger | Silinen mesajlar kırmızı ve "silindi" etiketiyle sohbette kalır, düzenlenenlerin eski hâlleri üstte görünür; hayalet etiket uyarısı; yok sayılan kullanıcı/kanal/sunucu | Kayıt uygulama kapanınca sıfırlanır (PC'de de varsayılan bu) |
| 3 | HideEndcord | Endcord'un Discord ayarlarındaki bölümünü gizler; `/hideendcord` geri getirir | PC'deki F8 kısayolu yerine komut ve ayar düğmesi |
| 4 | FakeNitro | Kullanamadığınız emoji ve çıkartmalar bağlantı olarak gider; izin yoksa önce sorar | Yayın kalitesi kısmı mobilde yok |
| 5 | SmoothType | Metin kutularında imleç ve seçim rengi | Android'in yerel metin kutusunda imleç animasyonu değiştirilemiyor, yalnızca renkler |
| 6 | ViewIcons | Avatar, afiş ve sunucu simgesine dokununca tam boyut; uzun basınca sunucu avatarı veya bağlantıyı kopyalama | Bağlam menüsü girdileri yok |
| 7 | ThemeLibrary | Topluluk tema pazarı ve Catppuccin temalarını uygulama içinden yükleme | PC'deki masaüstü CSS temaları mobilde çalışmadığı için mobil tema kaynakları kullanılıyor |
| 8 | oneko | Ekrana dokunduğunuz yere koşan kedi | Fare yerine dokunma |
| 9 | PlatformIndicators | Mesaj saatinin yanında masaüstü/web/mobil simgeleri | Üye listesi ve profil konumları yok |
| 10 | RelationshipNotifier | Arkadaş, grup ve sunucudan çıkarılma bildirimleri; çevrimdışıyken olanlar açılışta | Bildirimler uygulama içi bildirim ve geçmiş listesi olarak |
| 11 | SilentTyping | "Yazıyor..." hiç gönderilmez; isteğe bağlı sohbet düğmesi ve `/silenttype` | DM'lerde gösterme seçeneği |
| 12 | FakeMute | Mikrofon/ses çalışırken susturulmuş veya sağırlaştırılmış görünme; düğmeler ve `/fakemute`, `/fakedeafen` | FakeDeafen ayrı eklenti değil, aynı eklentide |

## Nasıl yazılır

Her eklenti `definePlugin` ile tanımlanır (`bundle/src/plugins/api.ts`):

```tsx
const plugin = definePlugin({
    id: "endcord.ornek",
    name: "Ornek",                       // Endcord PC'deki adıyla aynı
    description: tx("What it does"),     // İngilizce; gösterilirken çevrilir
    authors: [ENDCORD_AUTHOR],
    settings: { enabled: { type: "boolean", label: tx("Label"), default: true } },
    start({ store, cleanup }) {
        cleanup(onAction("SOME_ACTION", payload => { /* ... */ }));
    },
});
```

- Ayar sayfası şemadan otomatik oluşur; fazlası için `SettingsComponent`.
- Discord modülleri kaynak yollarıyla bulunur: `moduleAt("modules/...tsx")`. Yollar ad aramalarından daha kalıcıdır.
  Discord 350.8'deki bütün yolların listesi bundle'ın string tablosundan çıkarılabilir (bkz. STATUS.md).
- Bir modül yoksa eklenti `throw` eder; çatı onu kapatır ve kullanıcıya söyler. Discord asla çökmez.
- Her kullanıcı metni `t()`/`tx()` ile; `bun run i18n` çevirileri Endcord PC'den alır, eksikler `overrides.json`'a.

## Sonraki dalga (önerilen sıra)

1. ClearURLs, Translate, CharacterCounter, ShowHiddenChannels, NoReplyMention
2. ServerPinner, CustomTimestamps, BetterInvites
3. VoiceRejoin, AntiMoveDeco, FollowUser (ses kancaları; önce araştırma)
4. ReviewDB, USRBG, UserPFP (HTTP tabanlı)

Eski istemci kataloğundaki (`endcord-mobile/docs/plugins/*.md`) "Ported" ve "Partial" işaretli eklentiler mobilde
anlamlı olduğu kanıtlanmış adaylardır.
