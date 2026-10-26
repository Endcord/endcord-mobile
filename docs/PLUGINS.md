# Eklentiler (Endcord PC → Endcord for Android)

Endcord'un mobil eklentileri `bundle/src/plugins/` altında yaşar ve uygulamayla birlikte gelir: **155 eklenti**,
hepsi Endcord PC'den. Hepsi kapalı başlar; kullanıcı **Ayarlar → Endcord → Eklentiler** sayfasından açar. Popüler
olanlar, Endcord PC'deki sırayla en üstte ve "POPÜLER" etiketiyle görünür; sayfanın üstünde toplam ve açık eklenti
sayısı, durum ve etiket filtreleri var (Endcord PC'nin eklenti yöneticisi gibi).

> **Aliucord eklentileri bu istemcide çalışmaz.** Aliucord eklentileri, Aliucord'un dayandığı eski Discord'a (126.21)
> göre yazılmış Java/Kotlin kodudur; güncel Discord React Native'dir. Eklentiler sayfası bunu söyler ve Aliucord
> eklentileri isteyenleri hem Endcord hem Aliucord eklentilerini çalıştıran **Endcord Classic**'e (`main` dalı)
> yönlendirir. Vendetta ve Revenge eklentileri burada da kurulabilir.

## Popüler eklentiler (Endcord PC'nin "popüler" listesinin tamamı)

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

## Diğer eklentiler

Aşağıdaki açıklamalar uygulamada görünen Türkçe metinlerdir.

### Metin komutları (11)
Yazdığınızı başka bir şeye çevirip gönderen komutlar: `/bold`, `/ship`, `/calc`, `/morse`, `/uwuify`…

| Eklenti | Ne yapıyor |
| --- | --- |
| BoldText | /bold mesajını 𝐮𝐧𝐢𝐜𝐨𝐝𝐞 kalın yazıya çevirir (markdown çalışmayan yerlerde de). |
| Calculator | /calc ile sohbet kutusunda hızlı hesap yap. |
| ClapText | /clap ile 👏 kelimelerin 👏 arasına 👏 alkış 👏 koy. |
| GoogleThat | İnternet arama bağlantısı gönderme komutu ekler |
| LeetText | /leet mesajını 1337 dilinde yazar. |
| MoreCommands | Eğlenceli ve faydalı çeşitli komutlar ekler |
| ReverseText | /reverse mesajını tersten yazar. |
| ShipCalc | /ship iki kişi arasındaki aşkı puanlar. |
| SpaceOut | /spaceout h a r f l e r i n arasına boşluk koyar. |
| Starify | /starify mesajını parıltılarla süsler ｡ﾟ☆. |
| VibeCheck | /vibe ile sohbete rastgele bir vaporwave havası bırak. |

### Arama ve çeviri (9)
Discord'da ya da web'de bir şey arayan komutlar; Translate mesaj menüsünden çevirir.

| Eklenti | Ne yapıyor |
| --- | --- |
| AvatarGrabber | /avatar herhangi birinin (ya da kendinin) avatarını tam çözünürlükte getirir. |
| FriendInvites | Arkadaş davet bağlantılarını /friendinvites ile oluştur, listele ve iptal et |
| HypeSquadSwitcher | HypeSquad evleri arasında kolayca geçiş yap veya rozetini kaldır |
| InRole | Bir role kimlerin sahip olduğunu /inrole ile gör |
| PauseInvitesForever | Discord'un kaldırdığı davetleri süresiz durdurma seçeneğini geri getirir. |
| ServerInfo | Sunucu sağ tık menüsüne detaylı sunucu bilgilerini görüntüleme seçeneği ekler. |
| SpotifyShareCommands | Çalan Spotify şarkısını, albümü veya sanatçıyı komutla paylaş (/track, /album, /artist) |
| Translate | Mesajları mesaj menüsünden çevir, gönderdiklerini çevir ya da /translate kullan (Google Çeviri) |
| WikiLookup | /wiki herhangi bir şey için kısa Wikipedia özeti getirir (sadece sana). |

### Mesaj gönderirken (17)
Mesajı gönderilmeden hemen önce değiştiren eklentiler (`onSend`). Sıraları sabittir: önce metin, sonra biçim, en son imza.

| Eklenti | Ne yapıyor |
| --- | --- |
| AnonymiseFileNames | Yüklenen dosyaların adlarını gizler |
| AtSomeone | Rastgele birinden bahseder |
| AutoVaporwave | Gönderdiğin her mesajı otomatik olarak ｇｅｎｉｓ yazıya çevirir. |
| BetterPlusReacts | Emojinin önündeki + sayısı, tepkinin ekleneceği mesajı belirler |
| EmbeddedURLs | Sosyal medya bağlantılarını yerleştirilebilir adreslere çevirir; böylece gönderiler ve videolar dış siteyi açmaya gerek kalmadan Discord'da tam olarak görüntülenir. |
| MessageBurst | Kimse araya girmezse belirli süre içinde gönderdiğin mesajları öncekiyle birleştirir. |
| NoReplyMention | Yanıtlarda bahsetmeyi varsayılan olarak kapatır |
| NormalizeMessageLinks | Mesaj bağlantılarından canary/ptb kısmını siler |
| PolishWording | Mesajlarını daha düzgün görünmesi ve dilbilgisi için düzenler. Ayarlara bak |
| SelfDestruct | Ayarlanan süre sonra otomatik silinen mesajlar gönderir. Her mesajda kırmızı sayaç görünür. |
| Signature | Mesajlarına otomatik imza / son metin ekler |
| SilentMessageToggle | Mesaj kutusuna sessiz mesaj gönderme düğmesi ekler. |
| TalkInReverse | Mesajı göndermeden önce tersine çevirir. |
| TextReplace | Mesajlarındaki metni değiştir. Hazır kurallar Endcord sunucusundaki #textreplace-rules kanalında |
| Unindent | Kod bloklarındaki baştaki girintiyi kırpar |
| WriteUpperCase | Mesaj kutusunda her cümlenin ilk harfini büyük yapar |
| ZeroWidthSanitizer | İz sürme ve parmak izini önlemek için mesajlardaki görünmez sıfır genişlikli karakterleri siler |

### Gelen mesajlar ve filtreler (11)
Size ne ulaşacağına karar verenler: mesajlar, bildirimler, çıkartmalar, aramalar (`onIncomingMessage`).

| Eklenti | Ne yapıyor |
| --- | --- |
| BlockKeywords | Belirlediğin kelimeleri içeren mesajları, gönderen engellenmiş gibi gizler. |
| ClientSideBlock | Herhangi bir kullanıcının neredeyse tüm içeriğini sadece kendi ekranında gizlemeni sağlar |
| HideMessages | Mesajları mesaj menüsünden Discord'u yeniden başlatana kadar gizle |
| IgnoreCalls | Belirli kişilerden veya grup DM'lerinden gelen aramaları görmezden gelmeni sağlar. |
| iLoveSpam | 'Muhtemel spamcı' mesajlarını gizlemez |
| NoBlockedMessages | Engellenen/yok sayılan tüm mesajları sohbetten tamamen gizler |
| NoPendingCount | Gelen arkadaşlık isteklerinin ve mesaj isteklerinin bildirim sayısını kaldırır |
| NoProfileThemes | Nitro profil temalarını senin dışında herkesten tamamen kaldırır |
| ReplyPingControl | Yanıtlarda her zaman veya hiç bahsedilmemeyi beyaz ve kara listeyle ayarla |
| SilenceUsers | Belirli kişilerin @bahsetme bildirimlerini ve sunucu rozet sayılarını susturur. Normal mesaj ve DM'ler etkilenmez. |
| StickerBlocker | Çıkartmaların gösterilmesini engellemeni sağlar. |

### Bildirimler ve otomatik işler (9)
Anahtar kelimeler, ses kanalları, yeni sunucular ve takma adlar.

| Eklenti | Ne yapıyor |
| --- | --- |
| AntiDeleteMessage | Mesajların biri tarafından silinirse otomatik yeniden gönderir. Önbellek yeniden başlatmada korunur. |
| AntiNickname | Sunucuda sana zorla verilen takma adı otomatik sıfırlar. Yönetici izni gerekmez. |
| AutoReact | Belirli kelimeleri içeren mesajlara otomatik tepki verir. |
| KeywordNotify | Bir mesaj belirli kelime veya düzenli ifadelerle eşleşince bildirim gönderir |
| NewGuildSettings | Yeni katıldığın sunucuları otomatik susturur ve çeşitli ayarları değiştirir |
| ReadAllNotificationsButton | /readall ile tüm sunucuları tek seferde okundu olarak işaretle |
| ToastNotifications | DM, grup, arkadaş veya sunucu kanalları için ayarlanabilir açılır bildirim gösterir. |
| VoiceChannelLog | Ses kanalı etkinliğini kaydeder: katılmalar, ayrılmalar, geçişler, sunucu susturmaları, kameralar ve ekran paylaşımları |
| VoiceJoinMessages | Arkadaşların ses kanalına girince sadece sana görünen geçici mesaj al |

### Mesaj menüsü (22)
Bir mesaja uzun basınca açılan menüye satır ekleyenler (`addMessageAction`).

| Eklenti | Ne yapıyor |
| --- | --- |
| CopyEmojiMarkdown | Emojileri biçimli metin olarak kopyalamanı sağlar (<:blobcatcozy:1026533070955872337>) |
| CopyFileContents | Metin dosyası eklerinin içeriğini mesaj menüsünden kopyala |
| CopyMediaLink | Bir mesajdaki görsel, video ve dosyaların bağlantısını mesaj menüsünden kopyala |
| CopyStickerLinks | Çıkartma bağlantılarını kopyalayıp açmanı sağlar |
| CopyUserMention | Bir mesajın yazarının bahsetmesini mesaj menüsünden kopyala |
| CopyUserURLs | Bir mesajın yazarının profil bağlantısını mesaj menüsünden kopyala |
| DecodeBase64 | Herhangi bir mesajdaki base64 içeriği çözüp kopyalar. |
| DownloadAllAttachments | Bir mesajın tüm eklerini mesaj menüsünden tek seferde indir |
| ExportMessages | Herhangi bir mesajı mesaj menüsünden metin olarak paylaş |
| FindReply | Bir mesaja kanaldaki ilk cevaba atlar (eski konuşmaları takip etmeyi kolaylaştırır). |
| HideMedia | Bir mesajın eklerini ve yerleştirmelerini mesaj menüsünden gizle |
| Husk | Mesaj menüsünden husk ile tepki ver (emojiyi ayarlardan değiştir) |
| QuickDelete | Bir kanaldaki son mesajını /deletelast ile, herhangi bir mesajını da mesaj menüsünden onay sormadan sil |
| QuickMention | Bir mesajın yazarından mesaj menüsüyle bahset |
| RepeatMessages | Bir mesajı mesaj menüsünden yeniden gönder |
| ReverseImageSearch | Bir mesajdaki görseli mesaj menüsünden Google Lens, Yandex, SauceNAO ve daha fazlasında ara |
| SilentDelete | Mesajı 'sessizce' siler: önce yer tutucuyla değiştirip mesaj kaydedicileri atlatır. |
| SongLink | Şarkı bağlantılarını mesaj menüsünden song.link üzerinden kendi müzik servisinde aç |
| UnitConverter | Bir mesajdaki metrik ve emperyal birimleri mesaj menüsünden dönüştür |
| UnsuppressEmbeds | Mesajlarda gizlenmiş önizlemeleri geri açmanı sağlar |
| ViewRaw | Herhangi bir mesajın ham içeriğini ve verisini görüntüle ve kopyala |
| VoiceDownload | Sesli mesajları mesaj menüsünden indir |

### Hatırlatıcılar, zamanlanmış mesajlar, yer işaretleri (5)
Cihazda saklanır, yeniden başlatmadan sonra da durur.

| Eklenti | Ne yapıyor |
| --- | --- |
| Bookmarks | Mesajları mesaj menüsünden gizlice yer işaretine ekle (Discord'un 50 sabitleme sınırının ötesinde), sonra eklentinin ayarlarında ya da /bookmarks ile bulup onlara git |
| MessageReminders | Bir mesajı mesaj menüsünden daha sonra hatırlatılmak üzere ayarla. Hatırlatıcı seni doğrudan o mesaja götürür. |
| MessageTags | Mesajları saatlerinin yanında görünen gizli etiketlerle (Yapılacak, Önemli, ...) işaretle ve eklentinin ayarlarında bul |
| RemindMe | /remindme bir şeyi daha sonra sohbette bir notla hatırlatır. Yeniden başlatmadan sonra da çalışır. |
| ScheduledMessages | Mesajları belirli bir saatte veya bir süre sonra gönderilecek şekilde zamanla. |

### Sohbet görünümü (16)
Discord'un yerel sohbetinin satırlarını değiştirenler (`onMessageRow`): saat yanındaki metin, ad, renkler.

| Eklenti | Ne yapıyor |
| --- | --- |
| CustomTimestamps | Mesajlarda ve ipuçlarında özel zaman damgaları |
| CustomUserColors | Herhangi bir kullanıcıya sohbette özel bir ad rengi ver |
| FakeTag | Kullanıcı adının yanına sahte klan etiketi ve rozet ekler. Sadece sende görünür. |
| FriendshipRanks | Biriyle ne kadar süredir arkadaş olduğunu gösteren rozetler ekler |
| IrcColors | Sohbetteki kullanıcı adı renklerini IRC istemcilerindeki gibi herkese özel yapar |
| MessageLatency | Gönderilmesi n saniye veya daha fazla süren mesajlar için gösterge ekler |
| PinIcon | Sabitlenmiş mesajlara iğne ikonu ekler |
| RealtimeTimestamps | Her mesajın saatinde saniyeleri gösterir (örn. 15:34:21) |
| ShowMeYourName | Takma adların yanında kullanıcı adlarını gösterir veya takma adları hiç göstermez |
| ShowRolesInChat | Bir kullanıcının en yüksek rolünü sohbet mesajlarında adının yanında gösterir |
| ShowTimeoutDuration | Bir kullanıcının zaman aşımının ne kadar süreceğini mesajlarının yanında gösterir |
| SilentEdit | Kendi düzenlediğin mesajlarda '(düzenlendi)' etiketini gizler. Mesaj kalır, silinmez veya yeniden gönderilmez. |
| Timezones | Seçtiğin kullanıcıların yerel saatini mesajlarının yanında gösterir |
| ToneIndicators | Mesajlardaki /srs ve /gen gibi ton göstergelerini yanlarında açıklar |
| UserMessagesPronouns | Sohbet mesajlarında kullanıcıların zamirlerini gösterir |
| WordCount | Mesajların kelime sayısını saatlerinin yanında gösterir |

### Durum ve etkinlik (6)
Zengin durum, kayıtlı durumlar, boşta görünme.

| Eklenti | Ne yapıyor |
| --- | --- |
| AlwaysTrust | Güvenilmeyen bağlantı ve şüpheli dosya uyarılarını kaldırır |
| CustomIdle | Uygulama arka plandayken Discord'un seni boşta göstermesini engeller |
| CustomRPC | Profiline tamamen özelleştirilebilir bir Zengin Durum (oyun durumu) ekle |
| Experiments | Discord'un gizli geliştirici deneyleri (Experiments) sekmesini etkinleştirir. |
| LastFMRichPresence | Last.fm için küçük bir zengin durum eklentisi |
| StatusPresets | Durumlarını kaydedip sonra tekrar kullanmanı sağlar |

### Ses kanalları (4)

| Eklenti | Ne yapıyor |
| --- | --- |
| DisableCallIdle | DM sesli aramasında 3 dakika sonra atılıp AFK kanalına taşınmayı kapatır. |
| FollowUser | Birini mesaj menüsünden takip et ve her zaman onunla aynı ses kanalına katıl |
| RandomVoice | /randomvoice ile rastgele bir ses kanalına katıl |
| VoiceRejoin | Discord yeniden başlayınca DM/sunucu aramasına otomatik geri girer. |

### Profiller (5)
Endcord PC'nin kullandığı servislerden avatar, afiş, rozet ve tema renkleri.

| Eklenti | Ne yapıyor |
| --- | --- |
| CopyProfileColors | Kişilerin profil gradyan renklerini panoya kopyalar. |
| FakeProfileThemes | Biyografine görünmez 3y3 kodlamayla renk gizleyerek profil teması sağlar |
| GlobalBadges | Diğer istemci modlarının rozetlerini gösterir |
| UserPFP | Nitro olmadan hareketli avatar kullanmanı sağlar |
| USRBG | USRBG'den kullanıcı afişlerini gösterir; Nitro olmadan herkes afiş edinebilir |

### Araçlar (13)
Kendi komutlarınız, dışa aktarma, yedekleme, önizleme.

| Eklenti | Ne yapıyor |
| --- | --- |
| AlwaysAnimate | Hareket edebilen her şeyi hareketli gösterir |
| ClearMyMessages | Bir kanaldaki son mesajlarını /clearmessages ile sil |
| ContentWarning | Seçtiğin tetikleyici kelimeleri içeren mesajları dokunarak açılan bir spoilerin arkasına gizler |
| CustomCommands | Kendi eğik çizgi komutlarını / etiketlerini oluşturmanı sağlar |
| ExportDM | Bir sohbetin mesajlarını, eklerini, çıkartmalarını ve tepkilerini /exportdm ile TXT, Markdown veya JSON olarak dışa aktar |
| FakeMessage | /fakemsg ile herhangi bir kullanıcıymış gibi sadece senin göreceğin sahte mesaj gönder. |
| FriendCodes | Kolayca arkadaş eklemek için arkadaş kodu oluştur |
| HopOn | Hop on! Bu kanaldaki bir mesaj özel düzenli ifadeyle eşleşince ayarlanan bağlantıyı açar. |
| MemberCount | Bir sunucunun kaç üyesi olduğunu, kaçının çevrimiçi ve kaçının seste olduğunu /membercount ile gör |
| MessageFetchTimer | Bu kanalın mesajlarının ne kadar sürede yüklendiğini gösterir |
| PreviewMessage | Mesajını göndermeden önce önizlemeni sağlar. |
| SendTimestamps | `14:30` gibi yazılan saatler herkesin kendi saat diliminde gördüğü zaman damgalarına dönüşür; sohbet çubuğundaki bir düğme şu anki saati ekler |
| ServerBackup | Bir sunucunun kanallarını, rollerini ve izinlerini /serverbackup ile bir yedek dosyasına aktar |

### Kişiler (9)
Konuştuğunuz kişiler: kim oldukları, izinleri, en son ne zaman çevrimiçi oldukları.

| Eklenti | Ne yapıyor |
| --- | --- |
| BetterSessions | Giriş yapılmış cihazlarını tam zamanları ve onlara verdiğin adlarla gör, yeni girişlerden haberdar ol |
| CopyStatusUrls | Bir mesajın yazarının durumundaki bağlantıları mesaj menüsünden kopyala |
| ExpressionCloner | Bir mesajdaki özel emojileri mesaj menüsünden kendi sunucularına kopyala |
| IRememberYou | Konuştuğun herkesi (sunucular dahil) kaybolmaya karşı yerel olarak kaydeder |
| LastOnline | Arkadaşlarının en son ne zaman çevrimiçi olduğunu hatırlar; mesaj menüsünde ya da /lastonline ile gör |
| MessageTranslate | Mesajları önbellekli, kanal bazlı ayarlarla otomatik olarak diline çevirir. |
| PermissionsViewer | Bir mesajın yazarının rollerini ve izinlerini mesaj menüsünden gör |
| PingNotifications | Gelişmiş bahsetme biçimiyle özelleştirilebilir bildirimler |
| ReviewDB | Bir mesajın yazarı hakkındaki ReviewDB değerlendirmelerini mesaj menüsünden oku |

### Eğlence ve sağlık (5)
Endcord'un ekran katmanında çizilenler ve Wellbeing.

| Eklenti | Ne yapıyor |
| --- | --- |
| ClickSparkles | Dokunduğun her yere küçük neon ışıltılar serper |
| Jumpscare | Kanal açtığında ayarlanabilir bir ihtimalle seni korkutur. Geometry Dash Mega Hack'ten esinlenildi |
| Moyai | Açık olan sohbette bir moyai emojisi gönderildiğinde veya tepki olarak eklendiğinde 🗿 ses efekti çalar |
| Snowfall | Discord'da kar yağsın |
| Wellbeing | Discord'u nasıl kullandığına dair nazik ve gizli bir pano: ekran süresi, mesajlar ve mola hatırlatıcıları. Her şey telefonunda kalır. |

## Nasıl yazılır

Her eklenti `definePlugin` ile tanımlanır (`bundle/src/plugins/api.ts`). Discord'a dokunan işler
`bundle/src/plugins/hooks.tsx`'teki ortak uç noktalarla yapılır; her biri Discord'a bir kez yamalanır ve bütün
eklentiler paylaşır:

```tsx
const Ornek = definePlugin({
    id: "endcord.ornek",
    name: "Ornek",                         // Endcord PC'deki adıyla aynı
    description: tx("What it does"),       // Endcord PC'deki İngilizce açıklama: çevirisi oradan bedava gelir
    authors: [ENDCORD_AUTHOR],
    settings: { enabled: { type: "boolean", label: tx("Label"), default: true } },
    start({ store, cleanup }) {
        cleanup(
            onSend("ornek", content => store.enabled ? content.toUpperCase() : undefined),
            addMessageAction({ key: "ornek", icon: "CopyIcon", label: () => t("Copy"), onPress: m => copy(m.content) }),
            command({ name: "ornek", description: tx("Does something"), run: () => "hello" }),
        );
    },
});
```

- `onSend` mesajı gönderilmeden önce değiştirir ya da `null` döndürüp göndermez; `onIncomingMessage` gelen
  mesajı gizler veya değiştirir; `onMessageRow` mesajın çizilişini değiştirir; `addMessageAction` mesaj menüsüne
  satır ekler; `command` çevrilmiş açıklamalı eğik çizgi komutu ekler.
- Her geri çağırma yalıtılmıştır: biri hata verirse günlüğe yazılır ve atlanır, diğerleri çalışmaya devam eder.
  Flux araya girenleri de kendi hatalarını yakalar, yani bir eklenti Discord'un bir olayı işlemesini durduramaz.
- Ayar sayfası şemadan otomatik oluşur; fazlası için `SettingsComponent`. İstem, seçim ve metin pencereleri
  `ui/dialogs.tsx`'te, kayıt listeleri `ui/LogList.tsx`'te, kalıcı zamanlayıcılar `scheduler.ts`'te.
- Discord modülleri kaynak yollarıyla da bulunur: `moduleAt("modules/...tsx")`. Yollar ad aramalarından daha kalıcıdır.
- Bir modül yoksa eklenti `throw` eder; çatı onu kapatır ve kullanıcıya söyler. Discord asla çökmez.
- Her kullanıcı metni `t()`/`tx()` ile; `bun run i18n` çevirileri Endcord PC'den alır, eksikler `overrides.json`'a.
  CI `--strict` ile çalışır: çevirisi eksik bir metin derlemeyi durdurur.
- Emülatör testi (`.github/workflows/emulator.yml`) her eklentiyi gerçek Discord'da açıp kapatır ve uç noktaları
  gerçek mesajlarla dener.
