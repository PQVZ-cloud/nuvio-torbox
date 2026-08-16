import { parseQuality, parseFormat, fetchWithTimeout } from './utils.js';

const DMM_BASE = 'https://debridmediamanager.com/api/torrents';
const DMM_TIME_URL = 'https://api.real-debrid.com/rest/1.0/time/iso';
const DMM_SALT = 'debridmediamanager.com%%fe7#td00rA3vHz%VmI';

// DMM protects its torrent search API with a challenge-response token:
//   dmmProblemKey = "<random hex token>-<unix seconds>"
//   solution      = combineHashes(hash(token-ts), hash(salt-token))
// The hash is a custom 32-bit function (imul-based, Hermes-safe, no crypto lib).
function dmmHash(str) {
  let hash1 = (0xdeadbeef ^ str.length) | 0;
  let hash2 = (0x41c6ce57 ^ str.length) | 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash1 = Math.imul(hash1 ^ c, 2654435761);
    hash2 = Math.imul(hash2 ^ c, 1597334677);
    hash1 = (hash1 << 5) | (hash1 >>> 27);
    hash2 = (hash2 << 5) | (hash2 >>> 27);
  }
  hash1 = (hash1 + Math.imul(hash2, 1566083941)) | 0;
  hash2 = (hash2 + Math.imul(hash1, 2024237689)) | 0;
  return ((hash1 ^ hash2) >>> 0).toString(16);
}

function combineHashes(h1, h2) {
  const hl = Math.floor(h1.length / 2);
  const f1 = h1.slice(0, hl);
  const s1 = h1.slice(hl);
  const f2 = h2.slice(0, hl);
  const s2 = h2.slice(hl);
  let out = '';
  for (let i = 0; i < hl; i++) out += f1[i] + f2[i];
  out += s2.split('').reverse().join('') + s1.split('').reverse().join('');
  return out;
}

function buildAuth(ts) {
  const token = Math.floor(Math.random() * 0xffffffff).toString(16);
  const tw = token + '-' + ts;
  const sol = combineHashes(dmmHash(tw), dmmHash(DMM_SALT + '-' + token));
  return { tw: tw, sol: sol };
}

// Server time comes from Real-Debrid's public endpoint (fallback: device clock).
function getAuth() {
  return fetchWithTimeout(DMM_TIME_URL, null, 8000)
    .then(function (res) {
      return res && res.ok ? res.text() : null;
    })
    .then(function (text) {
      let ts = Math.floor(Date.now() / 1000);
      if (text) {
        const t = new Date(text.trim()).getTime();
        if (!isNaN(t)) ts = Math.floor(t / 1000);
      }
      return buildAuth(ts);
    })
    .catch(function () {
      return buildAuth(Math.floor(Date.now() / 1000));
    });
}

// Scraped-and-cached torrents indexed by IMDb id on Debrid Media Manager.
// Returns candidate objects: { hash, filename, quality, format, sizeBytes, seeders, source }
export function searchDmmSources(mediaType, imdbId, season, episode) {
  if (!imdbId) return Promise.resolve([]);

  const q =
    mediaType === 'tv'
      ? 'imdbId=' + imdbId + '&seasonNum=' + (season || 1) + '&episodeNum=' + (episode || 1)
      : 'imdbId=' + imdbId;

  return getAuth()
    .then(function (auth) {
      const url =
        DMM_BASE + '/' + mediaType + '?' + q +
        '&dmmProblemKey=' + encodeURIComponent(auth.tw) +
        '&solution=' + auth.sol +
        '&onlyTrusted=true&maxSize=0&page=0';
      return fetchWithTimeout(url, null, 12000);
    })
    .then(function (res) {
      if (res && res.status === 429) {
        console.error('[torbox] DMM rate limited, skipping');
        return [];
      }
      if (!res || !res.ok) return [];
      return res.json();
    })
    .then(function (data) {
      if (!data || !data.results) return [];
      const out = [];
      for (let i = 0; i < data.results.length; i++) {
        const r = data.results[i];
        if (!r || !r.hash) continue;
        const title = r.title || '';
        out.push({
          hash: r.hash.toLowerCase(),
          filename: title,
          quality: parseQuality(title),
          format: parseFormat(title),
          sizeBytes: r.fileSize ? Math.round(r.fileSize * 1024 * 1024) : 0,
          seeders: 0,
          source: 'DMM'
        });
      }
      return out;
    })
    .catch(function (err) {
      console.error('[torbox] DMM error:', err && err.message ? err.message : err);
      return [];
    });
}