# nuvio-torbox

بروفايدر **TorBox Debrid** لتطبيق **Nuvio** — يبحث عن روابط بث (cached فقط) ويحوّلها لروابط مباشرة عبر حساب TorBox الخاص بك.

## المميزات

- **Cached فقط**: `add_only_if_cached=true` — لا تحميلات، تشغيل فوري
- **روابط Permalink**: الرابط يحوي `token` ويعيد التوجيه مباشرة لسيرفر CDN — يشتغل في أي مشغل بدون headers
- **مصادر هاشات متعددة**: Torrentio (TMDB + IMDb) + DMM (فهرس تورنتات موثوقة من Debrid Media Manager) — دمج وتنقية تلقائية
- **فرز بالجودة أولاً**: 2160p > 1080p > 720p ثم seeders — أقصى دقة أولاً
- **إعادة استخدام تلقائية**: نفس التورنت لا يُضاف مرتين (idempotent)
- **اختيار ملف ذكي**: تطابق الحلقة للمسلسلات، وأكبر ملف فيديو للفيلم
- **إخفاق آمن**: أي مصدر/مرشح يفشل لا يوقف الباقي
- **إعدادات داخل التطبيق**: `onSettings()` + `globalThis.SCRAPER_SETTINGS` — مفاتيح TorBox/TMDB (كلمات مرور) + فلتر أقصى دقة وحجم ملف (نفس نمط مستودع nuvio-providers الرسمي)

## المتطلبات

1. حساب **TorBox** بخطة مدفوعة + API key (https://torbox.app/settings → API)
2. مفتاح **TMDB API** مجاني (https://www.themoviedb.org/settings/api → Request API Key)
   - مطلوب لتحويل TMDB ID → IMDb ID (يرجع البروفايدر صفر للأفلام والمسلسلات بدونه — على الأقل بينما خادم TMDB الخاص بـ Torrentio متعطل)
3. نسخة **تطوير** من تطبيق Nuvio (النسخ من المتاجر لا تدعم Plugin Tester)

## الإعداد

```bash
npm install
node build.js          # أو node build.js --minify للإنتاج
```

**المفاتيح لا تُرفع أبداً على GitHub** — المستخدم يدخلها مرة واحدة من إعدادات البروفايدر داخل التطبيق (حقول TorBox API Key / TMDB API Key بنمط كلمة مرور):

- **الاختبار المحلي**: انسخ `src/torbox/config.example.js` إلى `src/torbox/config.local.js` وضع مفاتيحك الحقيقية فيه (متجاهل من git) — يراه `test/test.js` فقط
- **داخل التطبيق**: Nuvio → إعدادات البروفايدر → أدخل المفتاحين (تُحفظ على جهازك)

## الاختبار المحلي

```bash
node test\test.js movie   # فيلم (Oppenheimer)
node test\test.js tv      # مسلسل (The Last of Us S01E01)
```

## التجربة داخل التطبيق

```bash
npm start
```

افتح Nuvio → **Settings → Developer → Plugin Tester**، وأدخل:
`http://IP-جهازك:3000/manifest.json`
أو جرّب الفردي: `http://IP-جهازك:3000/providers/torbox.js`

## الإضافة كـ Repository

ارفع المشروع على GitHub (مستودع **خاص**!) وأضف في Nuvio — **يُفضَّل jsDelivr** (أكثر استقراراً من raw.githubusercontent وقد تسقط Nuvio البروفايدر بصمت إذا فشل تحميل الكود):

`https://cdn.jsdelivr.net/gh/<اسمك>/nuvio-torbox@main/manifest.json`

البديل: `https://raw.githubusercontent.com/<اسمك>/nuvio-torbox/main/manifest.json`

> **إذا اختفى البروفايدر من القائمة**: هذا سلوك Nuvio عند فشل تحميل ملف الكود (شبكة/CDN). احذف المستودع وأعد إضافته برابط jsDelivr، ثم أعد إدخال المفاتيح (الإعدادات تُحفظ لكل رابط مستودع).

## ⚠️ أمان

- **لا يوجد أي مفتاح داخل الملفات المرفوعة** — `providers/torbox.js` المبني نظيف (تحقّق: `push.ps1` يفحص قبل الرفع)
- المفاتيح تصل للبروفايدر فقط عبر `globalThis.SCRAPER_SETTINGS` (إعدادات التطبيق)
- `src/torbox/config.local.js` متجاهل في `.gitignore` — لا يُرفع أبداً

## الهيكل

```
nuvio-torbox/
├── src/torbox/
│   ├── index.js        # مدخل getStreams + onSettings (قراءة globalThis.SCRAPER_SETTINGS)
│   ├── config.js       # مفاتيحك (متجاهل من git)
│   ├── dmm.js          # مصدر DMM (توثيق challenge-response + بحث تورنتات)
│   ├── mapping.js      # TMDB ID → IMDb ID (TMDB API ثم Wikidata)
│   ├── sources.js      # مصدر الهاشات (Torrentio)
│   ├── torbox.js       # عميل API تبع TorBox (create/mylist/requestdl)
│   └── utils.js        # تحليل الجودة/الحجم/الحلقات
├── providers/torbox.js # الناتج المبني (ما يُقرأ من التطبيق)
├── build.js            # البناء + تحويل async/await لـ Hermes
├── server.js           # سيرفر تطوير محلي
└── manifest.json       # سجل البروفايدر (hasSettings: true)
```

## الإعدادات داخل التطبيق

- `hasSettings: true` في `manifest.json` يفعّل صفحة إعدادات البروفايدر في Nuvio
- `onSettings()` تُصدَّر مع `getStreams` وتعرف الحقول (header / text / select)
- القيم تصل داخل `getStreams` عبر `globalThis.SCRAPER_SETTINGS` (نفس نمط yoruix/nuvio-providers):
  - `torboxApiKey` (text + isPassword): مفتاح TorBox — ضروري
  - `tmdbApiKey` (text + isPassword): مفتاح TMDB — ضروري لخريطة TMDB→IMDb
  - `maxQuality`: Auto / 2160p / 1080p / 720p — يتجاهل مصادر أعلى من الحد
  - `sizeLimit`: 0 / 10 / 25 / 50 GB — يخفي الملفات الأكبر من الحد

## الرفع إلى GitHub (عام — آمن)

```powershell
$env:GITHUB_TOKEN = "ghp_..."   # Fine-grained token: صاحب المستودع فقط + Contents: Read/Write
.\push.ps1 -Owner "اسمك" -Repo "nuvio-torbox"
```

- السكربت **يفحص الملفات عن المفاتيح ويوقف** إذا وجد أي سر قبل الرفع
- بعد الرفع: **ألغِ التوكن** من إعدادات GitHub
- أضف المستودع في Nuvio (يُفضَّل jsDelivr): `https://cdn.jsdelivr.net/gh/<اسمك>/nuvio-torbox@main/manifest.json`

## ملاحظات معروفة

- Torrentio لا يقبل أرقام TMDB أحياناً (خادم الميتادات الخاص بهم يتعطل) — لذلك البروفايدر يجرب المسارين (TMDB و IMDb) ويدمج النتائج
- التورنتات المضافة تبقى في حساب TorBox (إدارة تلقائية مثل حذفها بعد المشاهدة غير متاحة حالياً في بيئة Nuvio)