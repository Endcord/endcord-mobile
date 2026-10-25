# Eklenti planı (Endcord PC → Endcord for Android)

Bu istemci Revenge'in eklenti sistemini kullanır: eklentiler TypeScript ile yazılır, Discord'un React Native
modüllerine `findByProps` ile ulaşır ve `before/after/instead` ile fonksiyonlara kanca takar. Endcord PC'nin
eklentileri de TypeScript'tir, ama masaüstü Discord'un webpack modüllerine regex yamalarıyla (`patches`) bağlanır.
Bu yüzden bir PC eklentisi olduğu gibi çalışmaz; her biri mobil API'ye uyarlanır.

## Ne kadarı taşınır

| PC eklentisinin parçası | Mobilde |
| --- | --- |
| Mesaj gönderme/alma kancaları (`onBeforeMessageSend` vb.) | Doğrudan karşılığı var (`MessageActions`, `flux` dispatcher) |
| Slash komutları | Doğrudan karşılığı var (`commands.registerCommand`) |
| Ayar şeması (`definePluginSettings`) | Karşılığı var (`storage` + ayar sayfası bileşenleri) |
| Saf TypeScript mantığı (çeviri, URL temizleme, zaman biçimleri, API çağrıları) | Olduğu gibi |
| `patches` (webpack regex yamaları) | Yeniden yazılır: modül `findByProps` ile bulunur, fonksiyona kanca takılır |
| React DOM / JSX arayüz, CSS | Yeniden yazılır: React Native bileşenleri ve action sheet'ler |

Kabaca eklenti kodunun %25-35'i taşınır, kalanı yeniden yazılır.

## Sıra

Önce eski istemcideki katalogda (`endcord-mobile/docs/plugins/*.md`) **Ported** olarak işaretlenen 122
eklenti ele alınır; bunların mobilde anlamlı olduğu zaten kanıtlanmıştır. Sonra **Partial** olanlar (114).
**Not applicable** (masaüstüne özel) ve **Skipped** (nefret içeriği, taciz, Nitro/Spotify kırma, self-bot)
olanlar burada da taşınmaz.

İlk dalga (en çok kullanılanlar, her biri yaklaşık bir gün):

1. MessageLogger, SilentTyping, ClearURLs, Translate, CharacterCounter
2. ShowHiddenChannels, ServerPinner, CustomTimestamps, BetterInvites, NoTrack (Revenge'de zaten var)
3. FakeMute/FakeDeafen, VoiceRejoin, AntiMoveDeco, FollowUser (ses kancaları farklı; önce araştırma)
4. ChatGPT, ReviewDB, USRBG, UserPFP (hepsi HTTP tabanlı, mantık olduğu gibi gelir)

## Nasıl eklenir

Her eklenti `bundle/src/plugins/<ad>/` altında kendi klasöründe yaşar ve Revenge'in dahili eklenti listesine
kaydedilir (`bundle/src/core/plugins`). Eklenti açıklamaları ve ayar metinleri `bundle/src/core/i18n/` tablolarına
beş dilde eklenir. Örnek olarak Revenge topluluk eklentilerine bakılabilir:
https://github.com/revenge-mod/revenge-community-plugins

Her eklenti, emülatörde gerçek Discord üzerinde denenmeden "taşındı" sayılmaz.
