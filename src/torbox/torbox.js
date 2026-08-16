import { API_BASE } from './config.js';
import { sleep, isVideoFile, matchEpisode } from './utils.js';

function apiHeaders(apiKey, extra) {
  const h = {
    Authorization: 'Bearer ' + apiKey,
    'User-Agent': 'Nuvio-TorBox/1.0'
  };
  if (extra) {
    for (const k in extra) h[k] = extra[k];
  }
  return h;
}

// Creates (or reuses) the torrent on the TorBox account.
// add_only_if_cached=true -> only cached torrents are added (instant, no downloads).
export function createTorrent(hash, apiKey) {
  const body =
    'magnet=' + encodeURIComponent('magnet:?xt=urn:btih:' + hash) + '&add_only_if_cached=true';

  return fetch(API_BASE + '/torrents/createtorrent', {
    method: 'POST',
    headers: apiHeaders(apiKey, { 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: body
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data || !data.success || !data.data || !data.data.torrent_id) return null;
      return data.data.torrent_id;
    });
}

export function getTorrent(torrentId, apiKey) {
  return fetch(API_BASE + '/torrents/mylist?id=' + torrentId + '&bypass_cache=true', {
    headers: apiHeaders(apiKey)
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data || !data.success || !data.data) return null;
      return data.data;
    });
}

// Waits until the torrent's file list is available (cached torrents are near-instant).
export function waitForFiles(torrentId, maxTries, apiKey) {
  const tries = maxTries || 5;
  let attempt = 0;

  function poll() {
    attempt++;
    return getTorrent(torrentId, apiKey).then(function (tor) {
      if (!tor) return null;
      if (tor.files && tor.files.length) return tor;
      if (attempt >= tries) return null;
      return sleep(1200).then(poll);
    });
  }

  return poll();
}

// Permalink that redirects straight to the CDN link.
// Works in any player with zero headers — this is the "improved" bit vs header-based streams.
export function buildStreamUrl(torrentId, fileId, apiKey) {
  return (
    API_BASE +
    '/torrents/requestdl?token=' +
    apiKey +
    '&torrent_id=' +
    torrentId +
    '&file_id=' +
    fileId +
    '&redirect=true'
  );
}

function largest(list) {
  let best = list[0];
  for (let i = 1; i < list.length; i++) {
    if ((list[i].size || 0) > (best.size || 0)) best = list[i];
  }
  return best;
}

// Picks the right video file inside the torrent:
// 1. exact filename match (from the hash source)
// 2. for TV: files matching the requested episode (fallback: unknown/episode-less files)
// 3. otherwise the largest video file
export function pickVideoFile(tor, mediaType, season, episode, hintName) {
  if (!tor || !tor.files || !tor.files.length) return null;

  const videos = [];
  for (let i = 0; i < tor.files.length; i++) {
    const f = tor.files[i];
    const fname = f.short_name || f.name || '';
    if (isVideoFile(fname)) {
      videos.push({ id: f.id, name: fname, size: f.size || 0 });
    }
  }
  if (!videos.length) return null;

  if (hintName) {
    const hintBase = hintName
      .replace(/[._]/g, ' ')
      .toLowerCase()
      .replace(/\.(mkv|mp4|webm|avi|mov|m4v|ts)$/, '')
      .trim();
    for (let i = 0; i < videos.length; i++) {
      if (videos[i].name.replace(/[._]/g, ' ').toLowerCase().indexOf(hintBase) !== -1) {
        return videos[i];
      }
    }
  }

  if (mediaType === 'tv' && season && episode) {
    const exact = [];
    const unknown = [];
    for (let i = 0; i < videos.length; i++) {
      const m = matchEpisode(videos[i].name, season, episode);
      if (m === true) exact.push(videos[i]);
      else if (m === null) unknown.push(videos[i]);
    }
    if (exact.length) return largest(exact);
    if (unknown.length) return largest(unknown);
  }

  return largest(videos);
}