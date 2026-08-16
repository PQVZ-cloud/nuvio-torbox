import {
  parseQuality,
  parseFormat,
  parseTorrentioTitle,
  matchEpisode
} from './utils.js';

const TORRENTIO_BASE = 'https://torrentio.strem.fun';

// Searches all configured hash sources in parallel and merges results.
// Returns a Promise of candidate objects:
//   { hash, fileIdx, filename, quality, format, sizeBytes, seeders, source }
export function searchHashSources(tmdbId, mediaType, season, episode, imdbId) {
  const calls = [];

  // 1) Torrentio by TMDB id (works when their TMDB metadata cache is up)
  calls.push(searchTorrentio(mediaType, tmdbId, season, episode, 'tmdb'));

  // 2) Torrentio by IMDb id (reliable route, needs the mapping)
  if (imdbId) {
    calls.push(searchTorrentio(mediaType, imdbId, season, episode, 'imdb'));
  }

  return Promise.all(calls).then(function (results) {
    let merged = [];
    for (let i = 0; i < results.length; i++) {
      merged = merged.concat(results[i]);
    }
    return merged;
  });
}

function searchTorrentio(mediaType, id, season, episode, idType) {
  const path =
    mediaType === 'tv'
      ? 'series/' + id + ':' + season + ':' + episode
      : 'movie/' + id;
  const url = TORRENTIO_BASE + '/stream/' + path + '.json';

  return fetch(url)
    .then(function (res) {
      if (!res.ok) return [];
      return res.json();
    })
    .then(function (data) {
      if (!data || !data.streams || !data.streams.length) return [];

      const out = [];
      for (let i = 0; i < data.streams.length; i++) {
        const s = data.streams[i];
        if (!s.infoHash) continue;

        const name = s.name || '';
        const title = s.title || '';
        const parsed = parseTorrentioTitle(title);
        const filename =
          s.behaviorHints && s.behaviorHints.filename ? s.behaviorHints.filename : title;

        // Skip entries that are clearly a different episode (season packs stay).
        const epMatch = matchEpisode(filename, season, episode);
        if (epMatch === false) continue;

        out.push({
          hash: s.infoHash.toLowerCase(),
          fileIdx: typeof s.fileIdx === 'number' ? s.fileIdx : null,
          filename: filename,
          quality: parseQuality(name + ' ' + title + ' ' + filename),
          format: parseFormat(filename),
          sizeBytes: parsed.sizeBytes,
          seeders: parsed.seeders,
          source: parsed.source || idType
        });
      }
      return out;
    })
    .catch(function (err) {
      console.error('[torbox] hash source error (' + idType + '):', err && err.message ? err.message : err);
      return [];
    });
}