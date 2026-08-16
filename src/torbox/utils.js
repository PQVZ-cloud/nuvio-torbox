export function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

const QUALITY_PATTERNS = [
  { re: /2160p|4k|uhd|2160/i, quality: 2160 },
  { re: /1080p|fhd|fullhd/i, quality: 1080 },
  { re: /720p|hd/i, quality: 720 },
  { re: /480p|sd/i, quality: 480 }
];

export function parseQuality(text) {
  if (!text) return 0;
  for (let i = 0; i < QUALITY_PATTERNS.length; i++) {
    if (QUALITY_PATTERNS[i].re.test(text)) return QUALITY_PATTERNS[i].quality;
  }
  return 0;
}

const VIDEO_EXT = ['mkv', 'mp4', 'webm', 'avi', 'mov', 'm4v', 'ts'];

export function isVideoFile(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  for (let i = 0; i < VIDEO_EXT.length; i++) {
    if (n.indexOf('.' + VIDEO_EXT[i]) !== -1) return true;
  }
  return false;
}

export function parseFormat(name) {
  if (!name) return 'mp4';
  const n = name.toLowerCase();
  for (let i = 0; i < VIDEO_EXT.length; i++) {
    if (n.indexOf('.' + VIDEO_EXT[i]) !== -1) return VIDEO_EXT[i];
  }
  return 'mp4';
}

// Torrentio titles look like:
//   "Oppenheimer 2023 2160p BluRay\n👤 48 👤 8.71 GB 👤 YTS"
// Split on emoji markers, then parse stats from the trailing parts.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]+/u;

export function parseTorrentioTitle(title) {
  let seeders = 0;
  let sizeBytes = 0;
  let source = '';
  if (!title) return { seeders: seeders, sizeBytes: sizeBytes, source: source, name: '' };

  const parts = title
    .split(EMOJI_RE)
    .map(function (s) {
      return s.replace(/\s+/g, ' ').trim();
    })
    .filter(function (s) {
      return s.length > 0;
    });

  const name = parts[0] || '';

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const sizeM = p.match(/^([\d.]+)\s*(GB|GiB|MB|MiB)$/i);
    if (sizeM) {
      const n = parseFloat(sizeM[1]);
      sizeBytes = sizeM[2].toLowerCase().indexOf('gb') !== -1 ? n * 1024 * 1024 * 1024 : n * 1024 * 1024;
    } else if (/^\d+$/.test(p)) {
      if (!seeders) seeders = parseInt(p, 10);
    } else {
      source = p;
    }
  }

  return { seeders: seeders, sizeBytes: sizeBytes, source: source, name: name };
}

// Returns true (matches episode), false (definitely a different episode) or null (unknown).
export function matchEpisode(name, season, episode) {
  if (!season || !episode || !name) return null;
  const n = name.replace(/[._]/g, ' ').toLowerCase();
  const s = ('0' + season).slice(-2);
  const e = ('0' + episode).slice(-2);
  const re = new RegExp('s' + s + '\\s*e' + e + '|' + season + '\\s*x\\s*' + episode + '\\b', 'i');
  if (re.test(n)) return true;
  const hasAnyEp = /s\d{1,2}\s*e\d{1,2}|\b\d{1,2}x\d{1,2}\b/i.test(n);
  return hasAnyEp ? false : null;
}