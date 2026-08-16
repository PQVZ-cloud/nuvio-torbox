// إعدادات عامة غير سرية — آمن للنشر.
export const API_BASE = "https://api.torbox.app/v1/api";

// المفاتيح الحقيقية لا توضع هنا!
// داخل التطبيق: أدخلها من إعدادات البروفايدر (TorBox API Key / TMDB API Key)
// للاختبار المحلي: انسخ هذا الملف كـ config.local.js وضع مفاتيحك الحقيقية (متجاهل من git)
module.exports = {
  torboxApiKey: "PASTE_YOUR_TORBOX_API_KEY",
  tmdbApiKey: "PASTE_YOUR_TMDB_API_KEY"
};