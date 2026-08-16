/**
 * torbox - Built from src/torbox/
 * Generated: 2026-08-16T17:57:41.070Z
 */

// src/torbox/mapping.js
var cache = {};
function isUsable(key) {
  return key && key.indexOf("YOUR_") !== 0 && key.indexOf("PASTE_") !== 0 && key.indexOf("ENTER") === -1;
}
function fromTmdbApi(tmdbId, mediaType, tmdbApiKey) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "/external_ids?api_key=" + tmdbApiKey;
  return fetch(url).then(function(res) {
    if (!res.ok) return null;
    return res.json();
  }).then(function(data) {
    if (!data || !data.imdb_id) return "";
    return data.imdb_id;
  }).catch(function() {
    return "";
  });
}
function fromWikidata(tmdbId, mediaType) {
  let where;
  if (mediaType === "tv") {
    where = '?item wdt:P4947 "' + tmdbId + '" . ?item wdt:P31 ?type . VALUES ?type { wd:Q5398426 wd:Q15416 wd:Q1259759 wd:Q581714 } . ?item wdt:P345 ?imdb .';
  } else {
    where = '?item wdt:P4947 "' + tmdbId + '" . ?item wdt:P31 wd:Q11424 . ?item wdt:P345 ?imdb .';
  }
  const query = "SELECT ?imdb WHERE { " + where + " } LIMIT 1";
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
  return fetch(url, { headers: { "User-Agent": "Nuvio-TorBox/1.0" } }).then(function(res) {
    if (!res.ok) return "";
    return res.json();
  }).then(function(data) {
    const b = data && data.results && data.results.bindings;
    if (!b || !b.length || !b[0].imdb) return "";
    return b[0].imdb.value;
  }).catch(function() {
    return "";
  });
}
function tmdbToImdb(tmdbId, mediaType, tmdbApiKey) {
  const key = tmdbId + ":" + mediaType;
  if (key in cache) return Promise.resolve(cache[key]);
  if (isUsable(tmdbApiKey)) {
    return fromTmdbApi(tmdbId, mediaType, tmdbApiKey).then(function(imdb) {
      cache[key] = imdb;
      return imdb;
    });
  }
  return fromWikidata(tmdbId, mediaType).then(function(imdb) {
    cache[key] = imdb;
    return imdb;
  });
}

// src/torbox/utils.js
function sleep(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}
var QUALITY_PATTERNS = [
  { re: /2160p|4k|uhd|2160/i, quality: 2160 },
  { re: /1080p|fhd|fullhd/i, quality: 1080 },
  { re: /720p|hd/i, quality: 720 },
  { re: /480p|sd/i, quality: 480 }
];
function parseQuality(text) {
  if (!text) return 0;
  for (let i = 0; i < QUALITY_PATTERNS.length; i++) {
    if (QUALITY_PATTERNS[i].re.test(text)) return QUALITY_PATTERNS[i].quality;
  }
  return 0;
}
var VIDEO_EXT = ["mkv", "mp4", "webm", "avi", "mov", "m4v", "ts"];
function isVideoFile(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  for (let i = 0; i < VIDEO_EXT.length; i++) {
    if (n.indexOf("." + VIDEO_EXT[i]) !== -1) return true;
  }
  return false;
}
function parseFormat(name) {
  if (!name) return "mp4";
  const n = name.toLowerCase();
  for (let i = 0; i < VIDEO_EXT.length; i++) {
    if (n.indexOf("." + VIDEO_EXT[i]) !== -1) return VIDEO_EXT[i];
  }
  return "mp4";
}
var EMOJI_RE = /[\u2600-\u27BF\uFE0F\u200D]|[\uD83C-\uDBFF][\uDC00-\uDFFF]+/g;
function parseTorrentioTitle(title) {
  let seeders = 0;
  let sizeBytes = 0;
  let source = "";
  if (!title) return { seeders, sizeBytes, source, name: "" };
  const parts = title.split(EMOJI_RE).map(function(s) {
    return s.replace(/\s+/g, " ").trim();
  }).filter(function(s) {
    return s.length > 0;
  });
  const name = parts[0] || "";
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const sizeM = p.match(/^([\d.]+)\s*(GB|GiB|MB|MiB)$/i);
    if (sizeM) {
      const n = parseFloat(sizeM[1]);
      sizeBytes = sizeM[2].toLowerCase().indexOf("gb") !== -1 ? n * 1024 * 1024 * 1024 : n * 1024 * 1024;
    } else if (/^\d+$/.test(p)) {
      if (!seeders) seeders = parseInt(p, 10);
    } else {
      source = p;
    }
  }
  return { seeders, sizeBytes, source, name };
}
function matchEpisode(name, season, episode) {
  if (!season || !episode || !name) return null;
  const n = name.replace(/[._]/g, " ").toLowerCase();
  const s = ("0" + season).slice(-2);
  const e = ("0" + episode).slice(-2);
  const re = new RegExp("s" + s + "\\s*e" + e + "|" + season + "\\s*x\\s*" + episode + "\\b", "i");
  if (re.test(n)) return true;
  const hasAnyEp = /s\d{1,2}\s*e\d{1,2}|\b\d{1,2}x\d{1,2}\b/i.test(n);
  return hasAnyEp ? false : null;
}

// src/torbox/sources.js
var TORRENTIO_BASE = "https://torrentio.strem.fun";
function searchHashSources(tmdbId, mediaType, season, episode, imdbId) {
  const calls = [];
  calls.push(searchTorrentio(mediaType, tmdbId, season, episode, "tmdb"));
  if (imdbId) {
    calls.push(searchTorrentio(mediaType, imdbId, season, episode, "imdb"));
  }
  return Promise.all(calls).then(function(results) {
    let merged = [];
    for (let i = 0; i < results.length; i++) {
      merged = merged.concat(results[i]);
    }
    return merged;
  });
}
function searchTorrentio(mediaType, id, season, episode, idType) {
  const path = mediaType === "tv" ? "series/" + id + ":" + season + ":" + episode : "movie/" + id;
  const url = TORRENTIO_BASE + "/stream/" + path + ".json";
  return fetch(url).then(function(res) {
    if (!res.ok) return [];
    return res.json();
  }).then(function(data) {
    if (!data || !data.streams || !data.streams.length) return [];
    const out = [];
    for (let i = 0; i < data.streams.length; i++) {
      const s = data.streams[i];
      if (!s.infoHash) continue;
      const name = s.name || "";
      const title = s.title || "";
      const parsed = parseTorrentioTitle(title);
      const filename = s.behaviorHints && s.behaviorHints.filename ? s.behaviorHints.filename : title;
      const epMatch = matchEpisode(filename, season, episode);
      if (epMatch === false) continue;
      out.push({
        hash: s.infoHash.toLowerCase(),
        fileIdx: typeof s.fileIdx === "number" ? s.fileIdx : null,
        filename,
        quality: parseQuality(name + " " + title + " " + filename),
        format: parseFormat(filename),
        sizeBytes: parsed.sizeBytes,
        seeders: parsed.seeders,
        source: parsed.source || idType
      });
    }
    return out;
  }).catch(function(err) {
    console.error("[torbox] hash source error (" + idType + "):", err && err.message ? err.message : err);
    return [];
  });
}

// src/torbox/config.js
var API_BASE = "https://api.torbox.app/v1/api";

// src/torbox/torbox.js
function apiHeaders(apiKey, extra) {
  const h = {
    Authorization: "Bearer " + apiKey,
    "User-Agent": "Nuvio-TorBox/1.0"
  };
  if (extra) {
    for (const k in extra) h[k] = extra[k];
  }
  return h;
}
function createTorrent(hash, apiKey) {
  const body = "magnet=" + encodeURIComponent("magnet:?xt=urn:btih:" + hash) + "&add_only_if_cached=true";
  return fetch(API_BASE + "/torrents/createtorrent", {
    method: "POST",
    headers: apiHeaders(apiKey, { "Content-Type": "application/x-www-form-urlencoded" }),
    body
  }).then(function(res) {
    return res.json();
  }).then(function(data) {
    if (!data || !data.success || !data.data || !data.data.torrent_id) return null;
    return data.data.torrent_id;
  });
}
function getTorrent(torrentId, apiKey) {
  return fetch(API_BASE + "/torrents/mylist?id=" + torrentId + "&bypass_cache=true", {
    headers: apiHeaders(apiKey)
  }).then(function(res) {
    return res.json();
  }).then(function(data) {
    if (!data || !data.success || !data.data) return null;
    return data.data;
  });
}
function waitForFiles(torrentId, maxTries, pollMs, apiKey) {
  const tries = maxTries || 4;
  const interval = pollMs || 1e3;
  let attempt = 0;
  function poll() {
    attempt++;
    return getTorrent(torrentId, apiKey).then(function(tor) {
      if (!tor) return null;
      if (tor.files && tor.files.length) return tor;
      if (attempt >= tries) return null;
      return sleep(interval).then(poll);
    });
  }
  return poll();
}
function buildStreamUrl(torrentId, fileId, apiKey) {
  return API_BASE + "/torrents/requestdl?token=" + apiKey + "&torrent_id=" + torrentId + "&file_id=" + fileId + "&redirect=true";
}
function largest(list) {
  let best = list[0];
  for (let i = 1; i < list.length; i++) {
    if ((list[i].size || 0) > (best.size || 0)) best = list[i];
  }
  return best;
}
function pickVideoFile(tor, mediaType, season, episode, hintName) {
  if (!tor || !tor.files || !tor.files.length) return null;
  const videos = [];
  for (let i = 0; i < tor.files.length; i++) {
    const f = tor.files[i];
    const fname = f.short_name || f.name || "";
    if (isVideoFile(fname)) {
      videos.push({ id: f.id, name: fname, size: f.size || 0 });
    }
  }
  if (!videos.length) return null;
  if (hintName) {
    const hintBase = hintName.replace(/[._]/g, " ").toLowerCase().replace(/\.(mkv|mp4|webm|avi|mov|m4v|ts)$/, "").trim();
    for (let i = 0; i < videos.length; i++) {
      if (videos[i].name.replace(/[._]/g, " ").toLowerCase().indexOf(hintBase) !== -1) {
        return videos[i];
      }
    }
  }
  if (mediaType === "tv" && season && episode) {
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

// src/torbox/index.js
var MAX_CANDIDATES = 4;
var FILE_POLL_MS = 1e3;
var FILE_MAX_TRIES = 4;
function getSettings() {
  const g = typeof globalThis !== "undefined" && globalThis || typeof global !== "undefined" && global || {};
  return g.SCRAPER_SETTINGS || {};
}
function getKeys() {
  const s = getSettings();
  return {
    torbox: s.torboxApiKey || "",
    tmdb: s.tmdbApiKey || ""
  };
}
function applyPrefs(candidates) {
  const s = getSettings();
  const maxQuality = parseInt(s.maxQuality, 10) || 0;
  const sizeLimitGB = parseInt(s.sizeLimit, 10) || 0;
  return candidates.filter(function(c) {
    if (maxQuality && c.quality && c.quality > maxQuality) return false;
    if (sizeLimitGB && c.sizeBytes && c.sizeBytes > sizeLimitGB * 1e9) return false;
    return true;
  });
}
function onSettings() {
  return [
    { type: "header", label: "Account" },
    {
      type: "text",
      key: "torboxApiKey",
      label: "TorBox API Key",
      placeholder: "Your TorBox API key",
      description: "Required. https://torbox.app/settings -> API",
      isPassword: true
    },
    {
      type: "text",
      key: "tmdbApiKey",
      label: "TMDB API Key",
      placeholder: "Your TMDB API key",
      description: "Required to resolve TMDB -> IMDb IDs. https://themoviedb.org/settings/api",
      isPassword: true
    },
    { type: "header", label: "TorBox Preferences" },
    {
      type: "select",
      key: "maxQuality",
      label: "Max Resolution",
      description: "Cap the maximum stream resolution (Auto shows everything).",
      options: [
        { label: "Auto", value: "0" },
        { label: "2160p (4K)", value: "2160" },
        { label: "1080p (Full HD)", value: "1080" },
        { label: "720p (HD)", value: "720" }
      ],
      defaultValue: "0"
    },
    {
      type: "select",
      key: "sizeLimit",
      label: "Max File Size",
      description: "Hide streams larger than this (0 = no limit).",
      options: [
        { label: "No limit", value: "0" },
        { label: "Up to 10 GB", value: "10" },
        { label: "Up to 25 GB", value: "25" },
        { label: "Up to 50 GB", value: "50" }
      ],
      defaultValue: "0"
    }
  ];
}
function sortCandidates(a, b) {
  if (b.seeders !== a.seeders) return b.seeders - a.seeders;
  return (b.sizeBytes || 0) - (a.sizeBytes || 0);
}
function resolveOne(candidate, mediaType, season, episode, apiKey) {
  let torrentId = null;
  return createTorrent(candidate.hash, apiKey).then(function(id) {
    torrentId = id;
    if (!torrentId) return null;
    return waitForFiles(torrentId, FILE_MAX_TRIES, FILE_POLL_MS, apiKey);
  }).then(function(tor) {
    if (!tor) return null;
    const file = pickVideoFile(tor, mediaType, season, episode, candidate.filename);
    if (!file) return null;
    const url = buildStreamUrl(torrentId, file.id, apiKey);
    const quality = candidate.quality || parseQuality(file.name) || 0;
    const format = candidate.format || parseFormat(file.name);
    const label = quality ? quality + "p" : "Auto";
    const sizeGB = file.size ? (file.size / 1073741824).toFixed(1) : null;
    return {
      name: "TorBox " + label + (candidate.source ? " \u2022 " + candidate.source : ""),
      title: file.name + (sizeGB ? " \u2022 " + sizeGB + " GB" : ""),
      url,
      quality: label,
      format,
      size: file.size || 0,
      provider: "torbox"
    };
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  const keys = getKeys();
  if (!keys.torbox) {
    console.error("[torbox] no TorBox API key: set it in provider settings");
    return Promise.resolve([]);
  }
  return tmdbToImdb(tmdbId, mediaType, keys.tmdb).then(function(imdbId) {
    return searchHashSources(tmdbId, mediaType, season, episode, imdbId);
  }).then(function(candidates) {
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
    const attempts = top.map(function(candidate) {
      return resolveOne(candidate, mediaType, season, episode, keys.torbox).catch(function(err) {
        console.error("[torbox] candidate failed:", err && err.message ? err.message : err);
        return null;
      });
    });
    return Promise.all(attempts).then(function(results) {
      const streams = [];
      for (let i = 0; i < results.length; i++) {
        if (results[i]) streams.push(results[i]);
      }
      return streams;
    });
  }).catch(function(err) {
    console.error("[torbox] getStreams error:", err && err.message ? err.message : err);
    return [];
  });
}
module.exports = { getStreams, onSettings };
