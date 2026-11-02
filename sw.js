// 인터넷이 끊겨도 열리도록 화면 파일을 보관한다. 항상 새 버전을 먼저 시도한다.
// 화면 파일을 고쳐 다시 배포할 때는 CACHE 이름의 숫자를 올려 주세요.
var CACHE = 'jinjja-v20';
var FILES = ['./', 'index.html', 'paper.html', 'nav.js', 'style.css', 'config.js', 'data.js', 'checker_score.js', 'logic.js', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/api/') >= 0) return; // 실제 쓰임 확인 결과는 보관하지 않는다
  e.respondWith(fetch(e.request).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});
