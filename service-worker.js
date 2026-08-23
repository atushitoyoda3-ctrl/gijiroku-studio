// 議事録スタジオ — Service Worker
//
// Caches the app shell (index.html) so the app opens even without a
// network connection after the first visit, and caches the ひらがな変換
// library + dictionary files (~18MB total) so turning that feature on
// doesn't re-download them on every visit.
//
// Bump CACHE_NAME whenever this file or the caching strategy changes so
// old entries get cleaned up on activate.
var CACHE_NAME = 'gijiroku-studio-v1';
var APP_SHELL = ['./', './index.html'];

// These files are large and effectively immutable (a versioned dictionary
// snapshot), and app.js appends a "?retry=<timestamp>" cache-busting query
// when retrying a failed load — so we match/store them ignoring the query
// string, keyed only by filename.
var HEAVY_ASSET_NAMES = [
  'kuroshiro.min.js',
  'kuroshiro-analyzer-kuromoji.min.js',
  'base.dat.gz', 'cc.dat.gz', 'check.dat.gz', 'tid.dat.gz', 'tid_map.dat.gz',
  'tid_pos.dat.gz', 'unk.dat.gz', 'unk_char.dat.gz', 'unk_compat.dat.gz',
  'unk_invoke.dat.gz', 'unk_map.dat.gz', 'unk_pos.dat.gz'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL).catch(function (err) {
        // Don't fail install over the app-shell precache — the fetch
        // handler below will still cache it opportunistically on first load.
        console.warn('[sw] precache failed', err);
      });
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isHeavyAsset(pathname) {
  var name = pathname.split('/').pop();
  return HEAVY_ASSET_NAMES.indexOf(name) !== -1;
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave Google Fonts etc. untouched

  if (isHeavyAsset(url.pathname)) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  if (req.mode === 'navigate') {
    // App shell: network-first so updates are picked up while online,
    // falling back to the cached copy when offline.
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put('./index.html', copy); });
        }
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
  }
});
