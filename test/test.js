// Local test: node test/test.js movie   |   node test/test.js tv
// المفاتيح تأتي من src/torbox/config.local.js (متجاهل من git) وتُحقن كأنها إعدادات التطبيق
let localKeys = {};
try {
  localKeys = require('../src/torbox/config.local.js');
} catch (e) {
  console.error('config.local.js غير موجود — انسخ config.example.js إليه وضع مفاتيحك');
  process.exit(1);
}
globalThis.SCRAPER_SETTINGS = localKeys;

const { getStreams } = require('../providers/torbox.js');

function run(label, promise) {
  return promise
    .then(function (streams) {
      console.log('=== ' + label + ' ===');
      console.log('streams found: ' + streams.length);
      streams.forEach(function (s) {
        console.log(' - ' + s.name + ' | ' + (s.quality || '?') + ' | ' + s.format + ' | ' + s.title);
        console.log('   url: ' + s.url);
      });
    })
    .catch(function (err) {
      console.error('TEST FAILED:', err);
      process.exitCode = 1;
    });
}

const which = process.argv[2] || 'movie';

if (which === 'tv') {
  // The Last of Us S01E01 (tmdb 100088)
  run('TV - The Last of Us S01E01', getStreams('100088', 'tv', 1, 1));
} else {
  // Oppenheimer (tmdb 872585)
  run('MOVIE - Oppenheimer', getStreams('872585', 'movie', null, null));
}