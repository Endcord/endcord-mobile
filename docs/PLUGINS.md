# Eklentiler (Endcord PC → Endcord for Android)

Endcord'un mobil eklentileri `bundle/src/plugins/` altında yaşar ve uygulamayla birlikte gelir: **302 eklenti**:
Endcord PC'den gelen 260, Endcord'un mobil için kendi eklentileri 42 (çoğu bilgi ve eğlence komutları). Hepsi kapalı başlar; kullanıcı **Ayarlar → Endcord → Eklentiler** sayfasından açar. Popüler
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

### Durum ve etkinlik (7)
Zengin durum, kayıtlı durumlar, boşta görünme.

| Eklenti | Ne yapıyor |
| --- | --- |
| AlwaysTrust | Güvenilmeyen bağlantı ve şüpheli dosya uyarılarını kaldırır |
| CustomIdle | Uygulama arka plandayken Discord'un seni boşta göstermesini engeller |
| CustomRPC | Profiline tamamen özelleştirilebilir bir Zengin Durum (oyun durumu) ekle |
| Experiments | Discord'un gizli geliştirici deneyleri (Experiments) sekmesini etkinleştirir. |
| LastFMRichPresence | Last.fm için küçük bir zengin durum eklentisi |
| MusicRichPresence | ListenBrainz'den, dinlediğin şey için Zengin Durum |
| StatusPresets | Durumlarını kaydedip sonra tekrar kullanmanı sağlar |

### Ses kanalları (4)

| Eklenti | Ne yapıyor |
| --- | --- |
| DisableCallIdle | DM sesli aramasında 3 dakika sonra atılıp AFK kanalına taşınmayı kapatır. |
| FollowUser | Birini mesaj menüsünden takip et ve her zaman onunla aynı ses kanalına katıl |
| RandomVoice | /randomvoice ile rastgele bir ses kanalına katıl |
| VoiceRejoin | Discord yeniden başlayınca DM/sunucu aramasına otomatik geri girer. |

### Aramalar (9)
Aramada olanlar ve kanaldaki herkese birden işlem.

| Eklenti | Ne yapıyor |
| --- | --- |
| AntiMoveDeco | Biri seni taşıdığında ya da bağlantını kestiğinde seni ses kanalına geri koyar |
| CallTimer | Sesli aramalarda ve kanallarda geçen süreyi gösteren bir sayaç ekler. |
| PullUserIntoVoice | Bir mesajın yazarını mesaj menüsünden ses kanalına çek, istersen çekmeye devam et |
| VoiceChatUtilities | Ses kanalındaki herkesi /voiceall ile tek seferde at, taşı, sustur veya sağırlaştır |
| VoiceFakeDetector | Ses kanalındaki biri susturulmuş ya da sağırlaştırılmış görünüp konuşuyorsa sana söyler |
| VoiceServerInfo | Bağlı olduğun Discord ses sunucusunu ve gecikmesini gösterir |
| VoiceStats | Her kullanıcıyla seste ne kadar zaman geçirdiğini gösterir |
| WaitForSlot | Dolu bir ses kanalında yer açılınca otomatik girer. |
| WebcamStartNotifier | Ses kanalındaki biri kamerasını açtığında ya da kapattığında sana söyler |

### Sohbetlerde gezinme (9)
Notlar, atlamalar, yanıt bekleyenler, tablolar ve rozetler.

| Eklenti | Ne yapıyor |
| --- | --- |
| AntiSnitch | Seçtiğin kişiler bu kanalda yazmaya başlayınca ses ve bildirimle haber verir. |
| ChannelNotes | Herhangi bir kanala, DM'e veya gruba özel notlar ekle: kurallar, kim kimdir, hatırlanacaklar. Notlar cihazında kalır. |
| Ghosted | Henüz yanıtlamadığın DM'lerin listesini her biri için bir hayaletle tutar |
| ImageLink | Mesajdaki tek içerik olsa bile resim bağlantılarını gizlemez |
| JumpTo | Bir sohbetin ilk ya da en son mesajına /jumpto ile git |
| LastActive | Bir sohbette kendinin ya da başkasının son mesajına /lastactive ile git |
| MarkdownTables | Discord mesajlarında GitHub tarzı markdown tablolarını gösterir. |
| ShowBadgesInChat | Sohbette mesaj sahibinin rozetlerini adının yanında gösterir. |
| UserVoiceShow | Ses kanalındaki kişilerin mesajlarında bir gösterge gösterir ve mesaj menüsünden onlara katılmanı sağlar |

### Hesap ve uygulama (7)
Sunucu etiketleri, odak modu, profil ön ayarları, açılış süreleri, kayıtlar.

| Eklenti | Ne yapıyor |
| --- | --- |
| ClanSwitcher | Discord klan etiketlerini otomatik değiştirir |
| Declutter | Profil efektlerini ve avatar süslemelerini kaldırarak Discord'u sadeleştirir |
| DiscordDevBanner | Sürüm kimliğini gösteren Discord geliştirici şeridini açar |
| EventLogs | Kayıtlar: silinen/düzenlenen mesajlar, ses, arkadaşlar, sunucular. |
| FocusMode | Rahatsız Etmeyin için tek düğme: bir süreliğine ya da sen kapatana kadar; bittiğinde önceki durumuna döner |
| ProfileSets | Farklı profil ön ayarlarını kaydedip yüklemeni sağlar. |
| StartupTimings | Ayarlar menüsüne başlangıç süreleri ekler |

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

### Sohbet (6)
Uzun mesajları bölme, tepkileri sıralama, yanıtların saati, sizi doğrudan etiketleyen mesajlar, titreşim ve ChatGPT.

| Eklenti | Ne yapıyor |
| --- | --- |
| ChatGPT | ChatGPT'yi ayarlanabilir şekilde doğrudan Discord'da kullanmanı sağlar |
| MentionColors | Seni doğrudan etiketleyen mesajları @everyone ve @here bildirimlerinden farklı işaretler |
| ReplyTimestamp | Bir yanıtın cevapladığı mesajın ne zaman gönderildiğini, yanıtın saatinin yanında gösterir |
| SortReactions | Sohbette tepkileri sayısına göre sıralar. |
| SplitLargeMessages | Çok uzun mesajları göndermeden önce Discord sınırına uygun parçalara böler. |
| VibrateOnPing | Discord açıkken biri seni etiketlediğinde ya da DM attığında telefonunu titretir |

### Mesajlar (15)
Bağlantı önizlemeleri, spoiler'lar, alıntı, sed, şifreli ve görünmez mesajlar, mesaj kasası.

| Eklenti | Ne yapıyor |
| --- | --- |
| CustomReactionButtons | Mesaj menüsüne kendi tek dokunuşluk tepkilerini ekle |
| DontRoundMyTimestamps | Göreli zamanları hep aşağı yuvarlar; 7,6 yıl 8 değil 7 yıl olur |
| EncryptedMessage | /encrypt ile parolayla şifrelenmiş mesajlar gönder; yalnızca parolayı bilenler okuyabilir |
| FakeDM | /fakedm ile bir DM'e ya da grup DM'ine sahte yerel mesajlar ekler. Discord yeniden başlasa da kalırlar; yalnızca sen görürsün. |
| GifPaste | GIF seçince hemen göndermek yerine bağlantısını mesaj kutusuna ekler |
| InvisibleChat | /invisible ile sıradan bir mesajın içine parola korumalı gizli bir mesaj sakla |
| MessageLinkEmbeds | Başka mesaja bağlantı veren mesajlara önizleme ekler |
| MessageLoggerEnhanced | Silinen ve düzenlenen mesajları Discord yeniden başladıktan sonra da saklar; göz atmak için bir liste ve /deleted ile |
| MessageVault | Okuduğun mesajları, kaybolup gitseler bile /vault ile kelimeye ve kişiye göre ara. Yalnızca cihazında dizinlenir. |
| Quoter | Mesaj menüsünden bir mesajı yazarıyla birlikte mesaj kutuna alıntıla |
| RevealAllSpoilers | Mesaj menüsünden bir mesajdaki tüm spoiler'ları göster |
| SedEnhanced | Son mesajını s/bul/değiştir/ ile düzenle; düzenli ifadeler, bayraklar ve s\|a\|b\|g gibi başka ayraçlarla |
| TenorGifFix | Tenor GIF'lerini video yerine gerçek GIF olarak kaydeder |
| Translate+ | Endcord'un çeviri eklentisi, sanatsal dil desteğiyle! |
| WhitelistedEmojis | Beyaz listedekiler dışındaki tüm mesaj emojilerini kapatmanı sağlar. |

### Dosyalar ve medya (8)
Belgeleri ve ZIP'leri indirmeden görüntüleme, favoriler, GIF koleksiyonları ve DeArrow.

| Eklenti | Ne yapıyor |
| --- | --- |
| Dearrow | YouTube yerleştirmelerinin başlıklarını DeArrow ile daha az abartılı yapar |
| FavoriteAnything | Herhangi bir resmi, videoyu veya dosya ekini favorilere ekle |
| FileViewer | Word, Excel ve PowerPoint eklerini indirmeden, mesaj menüsünden görüntüle |
| FixFileExtensions | Mümkünse dosya uzantılarını desteklenen bir biçime çevirerek düzeltir |
| GifCollections | GIF koleksiyonları oluşturmanı sağlar. |
| PdfViewer | PDF eklerini önce indirmeden, mesaj menüsünden önizle |
| SaveFavoriteGIFs | Favori GIF bağlantılarını dışa aktar |
| ZipPreview | Dosya eklerinde ZIP içeriğini önizler. |

### Arkadaşlar ve profiller (15)
Engellenenler, arkadaşlık istekleri, etiketler, takma adlar, bağlantılar, zamirler ve seriler.

| Eklenti | Ne yapıyor |
| --- | --- |
| BetterActivities | Mesaj menüsünden, mesaj sahibinin şu anda yaptığı her şeyi gör |
| BetterBlockedUsers | Engellediğin kişilerin aranabilir listesi; tek dokunuşla engeli kaldır |
| CancelFriendRequest | Gönderdiğin arkadaşlık isteklerini gör ve iptal et |
| CancelFriendRequestNC | Gönderdiğin her arkadaşlık isteğini /cancelrequests ile iptal et |
| FriendNicknames | İnsanlara sohbette yalnızca senin göreceğin takma adlar ver |
| FriendTags | Arkadaşlarına kendi etiketlerini ver ve bir etikete sahip herkesi /friendtag ile listele |
| GitHubRepos | Kullanıcının herkese açık GitHub depolarını profilinde gösterir |
| MutualGroupDMs | Mesaj menüsünden, mesaj sahibiyle ortak grup DM'lerini gör |
| ProfileMedia | Mesaj menüsünden mesaj sahibinin avatarını ve afişini tam çözünürlükte aç |
| PronounDB | İnsanların PronounDB'deki zamirlerini mesajlarının yanında gösterir |
| ShowConnections | Mesaj menüsünden, mesaj sahibinin bağladığı hesapları (GitHub, Steam, Spotify...) gör |
| ShowSongName | Spotify etkinliğinde sanatçı yerine şarkı adını gösterir |
| SortFriendRequests | Arkadaşlık isteklerini geliş tarihine göre sıralar |
| Streaks | Biriyle art arda günlerde DM'leşince yanında seri gösterir. |
| WhoReacted | Mesaj menüsünden, bir mesaja hangi emojiyle kimin tepki verdiğini gör |

### Sunucular (12)
Yasaklama sebepleri, davetler, roller, sunucu arama ve üye etiketleri.

| Eklenti | Ne yapıyor |
| --- | --- |
| AutoDisconnectAndAutoMute | Seçili kişileri ses kanallarından otomatik çıkarır veya susturur |
| BetterBanReasons | /ban ile, kaydettiğin kendi sebeplerinden seçerek yasakla |
| BetterRoleContext | /roleinfo ile bir rolün rengini, simgesini, üyelerini ve izinlerini gör |
| BlurNSFW | Yaş kısıtlamalı kanallardaki ekleri sen dokunana kadar spoiler arkasında gizler |
| GreetStickerPicker | /greet ile yeni bir DM'deki birine ya da yeni bir üyeye seçtiğin çıkartmayla el salla |
| GuildPickerDumper | /dumpemojis ile bir sunucunun tüm emoji ve çıkartmalarının bağlantılarını paylaş |
| InviteDefaults | Ne kadar süreceği ve kaç kez kullanılabileceği için kendi varsayılanlarınla /invite ile davet oluştur |
| MoreUserTags | Webhook'lar ve yönetici rolleri (sahip, admin vb.) için etiket ekler |
| MutualServerMembers | Üye olduğun iki sunucuyu karşılaştır ve ikisinde de olan üyeleri /mutualmembers ile gör |
| ServerSearch | /servers ile bir sunucuyu adıyla bul ve sonuçtan aç |
| SurfaceTranslate | /translatechannel ile bir kanalın adını ve konusunu çevir |
| UrlHighlighter | Kalıplarına uyan bağlantılar içeren mesajları renklendirir |

### Durum, etkinlik ve sesler (9)
Ne yaptığınıza göre değişen durum, oyun ve Spotify görünürlüğü, ses düzeyleri ve Discord'un sesleri.

| Eklenti | Ne yapıyor |
| --- | --- |
| AutoDNDWhilePlaying | Oyun açınca çevrimiçi durumunu (çevrimiçi, boşta, rahatsız etmeyin) otomatik değiştirir |
| CustomSounds | Discord seslerini özelleştir. |
| ExitSounds | Sesten ayrılınca ses tablosundan ses çalar. |
| GameActivityToggle | Ne oynadığını göstermek ya da gizlemek için mesaj kutusunun yanına bir düğme ve /gameactivity ekler |
| IdleAutoRestart | Discord'u bir süre arka planda bıraktıktan sonra döndüğünde, temiz başlaması için yeniden yükler; ama asla bir arama sırasında değil |
| NotificationVolume | Kulaklarını koru: bildirimler ve uygulama sesleri için ayrı ses seviyesi ayarla |
| SpotifyActivityToggle | Spotify etkinliğinin görünürlüğü için açma/kapama butonu ekler. |
| StatusWhileActive | Ses kanalındayken çevrimiçi durumunu otomatik değiştirir. |
| UniversalVolume | Ses kanalındaki herkesi aynı ses seviyesine ayarlar; yeni gelenleri de aynı seviyede tutar. |

### Uygulamada gezinme (18)
DM ve sunucu sabitleme ya da gizleme, son kanallar, sayaçlar, temalar, StreamProof ve hızlı işlemler.

| Eklenti | Ne yapıyor |
| --- | --- |
| BetterInvites | /inviteinfo ile bir davetin nereye götürdüğünü, kimin oluşturduğunu ve ne zaman sona erdiğini katılmadan önce gör |
| ConsoleJanitor | Discord'un konsol kayıtlarını kapatır; yavaş telefonlarda iş yükünü azaltır |
| EndcordToolbox | Mesaj kutusunun yanına Endcord hızlı işlemlerini içeren bir düğme ekler: yeniden yükle, eklenti kapat, hata ayıklama bilgisi ve güvenli mod |
| FakeConnections | Kendi profiline yalnızca senin görebileceğin sahte bağlantılar ekle. |
| HideServers | /hideserver ile sunucuları sunucu listenden gizle; eklentinin ayarlarından geri getir |
| IconViewer | Eklentinin ayarlarında Discord'un tüm simgelerine göz at, ara ve adlarını kopyala |
| ImplicitRelationships | /implicit ile Discord'un en çok konuştuğunu düşündüğü kişileri, arkadaşın olmasalar bile gör |
| OpenInApp | Bağlantıları tarayıcı yerine ilgili uygulamada aç |
| PinDMs | /pindm ile DM'leri DM listenin en üstüne sabitle |
| QuickThemeSwitcher | /theme ya da mesaj kutusunun yanındaki bir düğmeyle yüklü temaların arasında geçiş yap |
| RecentChannelSwitcher | /recent ile son açtığın kanallara ve DM'lere geri dön |
| RecentDMSwitcher | /recentdms ile son açtığın DM'lere geri dön |
| ServerListIndicators | /indicators ile kaç arkadaşının çevrimiçi olduğunu ve kaç sunucuda olduğunu gör |
| ServerPinner | /pinserver ile sunucuları, klasörlerini değiştirmeden sunucu listenin en üstüne sabitle |
| StreamProof | Ekranını paylaşırken ya da kaydederken mesajları ve resimlerini gizler. Sohbet çubuğu düğmesiyle aç/kapat. |
| UnreadCountBadge | /unread ile bir sunucunun her kanalında kaç okunmamış mesaj olduğunu gör |
| VoiceCount | /voicecount ile bir sunucunun her sesli kanalında kaç kişi olduğunu gör |
| WhosWatching | /viewers ile yayınını kimin izlediğini gör |

### Bilgi ve eğlence komutları (38)
Sözlük, hava durumu, döviz, ülke ve tatil bilgisi, depremler, kod paketleri, oyunlar… Arama sonuçlarını yalnızca siz görürsünüz.

| Eklenti | Ne yapıyor |
| --- | --- |
| Advice | /advice ile rastgele bir tavsiye gönder |
| AnimeLookup | /anime ile bir animenin puanına, bölümlerine ve durumuna bak |
| BoredActivity | /bored ile yapacak bir şey fikri al |
| CatFacts | /catfact ile kediler hakkında rastgele bir bilgi gönder |
| CharInfo | /charinfo ile bir metindeki her karakterin Unicode kod noktasını gör |
| ColorInfo | /color ile bir rengin RGB ve HSL değerlerini gör ya da rastgele bir renk al |
| Countdown | /countdown ile bir tarihe ne kadar kaldığını gör |
| CountryInfo | /country ile bir ülkenin başkentine, nüfusuna, dillerine ve para birimine bak |
| CryptoPrices | /crypto ile bir kripto paranın fiyatını ve bugünkü değişimini gör |
| CurrencyConverter | Bugünkü kurlarla /currency ile para birimleri arasında çevir |
| Dictionary | /define ile İngilizce bir kelimenin anlamına bak |
| DiscordStatus | Discord'un kendisinde sorun olup olmadığını /discordstatus ile kontrol et |
| Earthquakes | /earthquakes ile dünyadaki ya da bir yerin yakınındaki son güçlü depremleri gör |
| Emojify | /emojify ile büyük harf emojileriyle mesaj yaz |
| GitHubLookup | /github ile bir GitHub kullanıcısına ya da deposuna bak |
| Hash | /sha256 ile bir metnin SHA-256 özetini al |
| Holidays | /holidays ile bir ülkenin yaklaşan resmi tatillerini gör |
| Jokes | /joke ile rastgele bir şaka gönder |
| LoremIpsum | /lorem ile mesaj kutusuna yer tutucu metin koy |
| MinecraftSkin | /mcskin ile bir Minecraft oyuncusunun skin'ini gönder |
| MinecraftStatus | /mcstatus ile bir Minecraft sunucusunun açık olup olmadığını ve kaç kişinin oynadığını gör |
| NpmLookup | /npm ile bir npm paketinin sürümüne, lisansına ve indirmelerine bak |
| PasswordGenerator | /passwordgen ile güçlü, rastgele bir parola oluştur; yalnızca sen görürsün ve kopyalanır |
| Pokedex | /pokemon ile bir Pokémon'un türlerine ve istatistiklerine bak |
| QRCode | /qr ile herhangi bir metnin ya da bağlantının QR kodunu gönder |
| Quotes | /quote ile rastgele ünlü bir söz gönder |
| RandomFacts | /fact ile rastgele bir bilgi gönder |
| RecipeFinder | /recipe ile bir yemeğin tarifini bul |
| RockPaperScissors | /rps ile taş, kağıt, makas oyna ve sonucu gönder |
| ShortenURL | /shorten ile bir bağlantıyı kısalt; kısa bağlantı mesaj kutusuna konur |
| SnowflakeInfo | /snowflake ile herhangi bir Discord kimliğinin (kullanıcı, mesaj, sunucu...) ne zaman oluşturulduğunu gör |
| SpaceLaunches | /launches ile yaklaşan roket fırlatmalarını gör |
| SteamLookup | /steam ile bir oyunun Steam fiyatına bak |
| Trivia | /trivia ile rastgele bir bilgi sorusunu cevapla |
| UrbanDictionary | /urban ile Urban Dictionary'de argo ara |
| UUIDGenerator | /uuid ile rastgele bir UUID oluştur ve kopyala |
| Weather | /weather ile her yerin hava durumunu gör |
| Xkcd | /xkcd ile bir xkcd çizgi romanı gönder: en yenisi, rastgele biri ya da bir numara |

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

Endcord PC'deki gibi her eklentinin kendi klasörü vardır: `bundle/src/plugins/<eklentiAdi>/index.ts(x)`. Birden
fazla eklentinin kullandığı kod `bundle/src/plugins/shared/` altındadır. Derleme, klasörlerden
`bundle/src/plugins/manifest.ts`'i üretir; bir klasörde birden fazla eklenti tanımlanırsa derleme durur.

Her eklenti `definePlugin` ile tanımlanır (`bundle/src/plugins/api.ts`). Discord'a dokunan işler
`bundle/src/plugins/hooks.tsx`'teki ortak uç noktalarla yapılır; her biri Discord'a bir kez yamalanır ve bütün
eklentiler paylaşır:

```tsx
// bundle/src/plugins/ornek/index.ts
export default definePlugin({
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
