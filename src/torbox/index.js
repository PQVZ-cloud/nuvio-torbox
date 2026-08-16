import { tmdbToImdb } from './mapping.js';
import { searchHashSources } from './sources.js';
import {
  createTorrent,
  waitForFiles,
  buildStreamUrl,
  pickVideoFile
} from './torbox.js';
import { parseQuality, parseFormat, sleep, withTimeout } from './utils.js';

const MAX_CANDIDATES = 4;
const FILE_POLL_MS = 1000;
const FILE_MAX_TRIES = 4;

function getSettings() {
  const g =
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof global !== 'undefined' && global) ||
    {};
  return g.SCRAPER_SETTINGS || {};
}

function getKeys() {
  const s = getSettings();
  return {
    torbox: s.torboxApiKey || '',
    tmdb: s.tmdbApiKey || ''
  };
}

function applyPrefs(candidates) {
  const s = getSettings();
  const maxQuality = parseInt(s.maxQuality, 10) || 0;
  const sizeLimitGB = parseInt(s.sizeLimit, 10) || 0;

  return candidates.filter(function (c) {
    if (maxQuality && c.quality && c.quality > maxQuality) return false;
    if (sizeLimitGB && c.sizeBytes && c.sizeBytes > sizeLimitGB * 1e9) return false;
    return true;
  });
}

function onSettings() {
  return [
    { type: 'header', label: 'Account' },
    {
      type: 'text',
      key: 'torboxApiKey',
      label: 'TorBox API Key',
      placeholder: 'Your TorBox API key',
      description: 'Required. https://torbox.app/settings -> API',
      isPassword: true
    },
    {
      type: 'text',
      key: 'tmdbApiKey',
      label: 'TMDB API Key',
      placeholder: 'Your TMDB API key',
      description: 'Required to resolve TMDB -> IMDb IDs. https://themoviedb.org/settings/api',
      isPassword: true
    },
    { type: 'header', label: 'TorBox Preferences' },
    {
      type: 'select',
      key: 'maxQuality',
      label: 'Max Resolution',
      description: 'Cap the maximum stream resolution (Auto shows everything).',
      options: [
        { label: 'Auto', value: '0' },
        { label: '2160p (4K)', value: '2160' },
        { label: '1080p (Full HD)', value: '1080' },
        { label: '720p (HD)', value: '720' }
      ],
      defaultValue: '0'
    },
    {
      type: 'select',
      key: 'sizeLimit',
      label: 'Max File Size',
      description: 'Hide streams larger than this (0 = no limit).',
      options: [
        { label: 'No limit', value: '0' },
        { label: 'Up to 10 GB', value: '10' },
        { label: 'Up to 25 GB', value: '25' },
        { label: 'Up to 50 GB', value: '50' }
      ],
      defaultValue: '0'
    }
  ];
}

function sortCandidates(a, b) {
  if (b.seeders !== a.seeders) return b.seeders - a.seeders;
  return (b.sizeBytes || 0) - (a.sizeBytes || 0);
}

function resolveOne(candidate, mediaType, season, episode, apiKey) {
  let torrentId = null;

  return createTorrent(candidate.hash, apiKey)
    .then(function (id) {
      torrentId = id;
      if (!torrentId) return null;
      return waitForFiles(torrentId, FILE_MAX_TRIES, FILE_POLL_MS, apiKey);
    })
    .then(function (tor) {
      if (!tor) return null;
      const file = pickVideoFile(tor, mediaType, season, episode, candidate.filename);
      if (!file) return null;

      const url = buildStreamUrl(torrentId, file.id, apiKey);
      const quality = candidate.quality || parseQuality(file.name) || 0;
      const format = candidate.format || parseFormat(file.name);
      const label = quality ? quality + 'p' : 'Auto';
      const sizeGB = file.size ? (file.size / 1073741824).toFixed(1) : null;

      return {
        name: 'TorBox ' + label + (candidate.source ? ' • ' + candidate.source : ''),
        title: file.name + (sizeGB ? ' • ' + sizeGB + ' GB' : ''),
        url: url,
        quality: label,
        format: format,
        size: file.size || 0,
        provider: 'torbox'
      };
    });
}

/**
 * Nuvio provider entry point.
 *
 * @param {string} tmdbId   - TMDB ID
 * @param {string} mediaType - "movie" | "tv"
 * @param {number} season    - season number (tv only)
 * @param {number} episode   - episode number (tv only)
 * @returns {Promise<Array>} - list of stream objects
 */
function getStreams(tmdbId, mediaType, season, episode) {
  const keys = getKeys();
  if (!keys.torbox) {
    console.error('[torbox] no TorBox API key: set it in provider settings');
    return Promise.resolve([]);
  }

  const work = tmdbToImdb(tmdbId, mediaType, keys.tmdb)
    .then(function (imdbId) {
      return searchHashSources(tmdbId, mediaType, season, episode, imdbId);
    })
    .then(function (candidates) {
      if (!candidates.length) return [];

      const seen = {};
      const unique = [];
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (!c.hash || seen[c.hash]) continue;
        seen[c.hash] = true;
        unique.push(c);
      }
      unique.sort(sortCandidates);

      const filtered = applyPrefs(unique);
      const top = filtered.slice(0, MAX_CANDIDATES);

      const attempts = top.map(function (candidate) {
        return resolveOne(candidate, mediaType, season, episode, keys.torbox).catch(function (err) {
          console.error('[torbox] candidate failed:', err && err.message ? err.message : err);
          return null;
        });
      });

      return Promise.all(attempts).then(function (results) {
        const streams = [];
        for (let i = 0; i < results.length; i++) {
          if (results[i]) streams.push(results[i]);
        }
        return streams;
      });
    })
    .catch(function (err) {
      console.error('[torbox] getStreams error:', err && err.message ? err.message : err);
      return [];
    });

  return withTimeout(work, 25000, 'getStreams');
}

module.exports = { getStreams, onSettings };