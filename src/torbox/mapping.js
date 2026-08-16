// Small in-memory cache: tmdbId:mediaType -> imdbId ('' = not found)
const cache = {};

function isUsable(key) {
  return (
    key &&
    key.indexOf('YOUR_') !== 0 &&
    key.indexOf('PASTE_') !== 0 &&
    key.indexOf('ENTER') === -1
  );
}

// Primary: TMDB API external_ids (needs a free TMDB API key)
function fromTmdbApi(tmdbId, mediaType, tmdbApiKey) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const url =
    'https://api.themoviedb.org/3/' + type + '/' + tmdbId + '/external_ids?api_key=' + tmdbApiKey;

  return fetch(url)
    .then(function (res) {
      if (!res.ok) return null;
      return res.json();
    })
    .then(function (data) {
      if (!data || !data.imdb_id) return '';
      return data.imdb_id;
    })
    .catch(function () {
      return '';
    });
}

// Fallback: Wikidata SPARQL (keyless, movies coverage is good, TV is spotty)
function fromWikidata(tmdbId, mediaType) {
  let where;
  if (mediaType === 'tv') {
    where =
      '?item wdt:P4947 "' + tmdbId + '" . ' +
      '?item wdt:P31 ?type . ' +
      'VALUES ?type { wd:Q5398426 wd:Q15416 wd:Q1259759 wd:Q581714 } . ' +
      '?item wdt:P345 ?imdb .';
  } else {
    where =
      '?item wdt:P4947 "' + tmdbId + '" . ' +
      '?item wdt:P31 wd:Q11424 . ' +
      '?item wdt:P345 ?imdb .';
  }
  const query = 'SELECT ?imdb WHERE { ' + where + ' } LIMIT 1';
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query);

  return fetch(url, { headers: { 'User-Agent': 'Nuvio-TorBox/1.0' } })
    .then(function (res) {
      if (!res.ok) return '';
      return res.json();
    })
    .then(function (data) {
      const b = data && data.results && data.results.bindings;
      if (!b || !b.length || !b[0].imdb) return '';
      return b[0].imdb.value;
    })
    .catch(function () {
      return '';
    });
}

// Returns a Promise of imdbId (string) or '' when unmappable.
export function tmdbToImdb(tmdbId, mediaType, tmdbApiKey) {
  const key = tmdbId + ':' + mediaType;
  if (key in cache) return Promise.resolve(cache[key]);

  if (isUsable(tmdbApiKey)) {
    return fromTmdbApi(tmdbId, mediaType, tmdbApiKey).then(function (imdb) {
      cache[key] = imdb;
      return imdb;
    });
  }

  return fromWikidata(tmdbId, mediaType).then(function (imdb) {
    cache[key] = imdb;
    return imdb;
  });
}