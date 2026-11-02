// 실제 쓰임 확인: 논문에서 가짜 단어를 검증한 방법(우리말샘 등재 확인 + 네이버 따옴표 검색)을 그대로 쓴다.
// Vercel 서버 함수. 키는 환경 변수로만 읽고 화면에는 절대 보내지 않는다.
//   OPENDICT_API_KEY    우리말샘 오픈 API 키 (opendict.korean.go.kr → 개발 지원)
//   NAVER_CLIENT_ID     네이버 검색 API 클라이언트 아이디 (developers.naver.com)
//   NAVER_CLIENT_SECRET 네이버 검색 API 클라이언트 시크릿
// 키가 없으면 그 출처는 { status: 'off' } 로 돌려주고, 화면은 "확인하지 못함"으로 안내한다.
'use strict';

var TIMEOUT_MS = 4500;
var USED_MIN = 5; // 실제 글 5건 이상에서 그대로 쓰이면 "실제로 쓰여요"

var SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻' };
function clean(s) {
  // 사전 뜻풀이에는 &lt;sub&gt;2&lt;/sub&gt; 처럼 글자로 바뀐 태그가 섞여 온다: 먼저 글자를 되돌린 뒤 태그를 지운다
  return String(s || '')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<sub>\s*([0-9]+)\s*<\/sub>/gi, function (m, d) { return d.split('').map(function (c) { return SUB[c]; }).join(''); })
    .replace(/<sup>\s*([0-9+\-]+)\s*<\/sup>/gi, function (m, d) { return d.split('').map(function (c) { return SUP[c]; }).join(''); })
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
function bare(s) { return String(s || '').normalize('NFC').replace(/[\s^\-·ㆍ]/g, ''); }

function validWord(raw) {
  if (typeof raw !== 'string') return '';
  var w = raw.normalize('NFC').trim();
  if (!w || w.length > 20) return '';
  if (!/^[가-힣A-Za-z0-9 ]+$/.test(w) || !/[가-힣A-Za-z]/.test(w)) return '';
  return w;
}

// 실패 이유를 키가 드러나지 않는 짧은 말로 바꾼다 (화면에서 원인을 찾을 수 있게)
function why(e) {
  var m = String((e && e.message) || '');
  if (e && e.name === 'AbortError') return 'timeout';
  if (/^HTTP \d+/.test(m)) return m.replace(' ', '-').toLowerCase();
  if (/json/i.test(m)) return 'bad-json';
  return 'network';
}

async function getJson(url, headers, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, ms || TIMEOUT_MS);
  try {
    var r = await fetch(url, { headers: headers || {}, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// ── 우리말샘: 표제어가 정확히 같은 항목의 뜻풀이 ──
async function checkDict(word) {
  var key = (process.env.OPENDICT_API_KEY || '').trim();
  if (!key) return { status: 'off' };
  try {
    var path = '//opendict.korean.go.kr/api/search?key=' + encodeURIComponent(key) +
      '&q=' + encodeURIComponent(word) + '&req_type=json&part=word&num=10&advanced=n';
    var data;
    try { data = await getJson('https:' + path, null, 6000); }
    catch (e1) {
      if (/^HTTP 4/.test(String(e1 && e1.message))) throw e1;
      data = await getJson('http:' + path, null, 6000); // https가 안 되면 http로 한 번 더
    }
    if (data && data.error) return { status: 'error', reason: 'api-' + String(data.error.error_code || data.error.message || 'error').slice(0, 20) };
    var items = data && data.channel && data.channel.item;
    if (!items) items = [];
    if (!Array.isArray(items)) items = [items];
    var target = bare(word), senses = [];
    items.forEach(function (it) {
      if (!it || bare(it.word) !== target) return;
      var list = Array.isArray(it.sense) ? it.sense : (it.sense ? [it.sense] : []);
      list.forEach(function (s) {
        if (s && s.definition && senses.length < 3) {
          senses.push({ def: clean(s.definition), pos: clean(s.pos), type: clean(s.type), cat: clean(s.cat), link: /^https?:\/\//.test(s.link || '') ? s.link : '' });
        }
      });
    });
    return { status: 'ok', found: senses.length > 0, senses: senses };
  } catch (e) {
    return { status: 'error', reason: why(e) };
  }
}

// ── 네이버 블로그·카페: 따옴표 검색 뒤, 제목·본문 요약에 그 낱말이 그대로 들어간 글만 센다 ──
function snippet(text, word) {
  var i = text.indexOf(word);
  if (i < 0) return text.slice(0, 110);
  var from = Math.max(0, i - 45), to = Math.min(text.length, i + word.length + 65);
  return (from > 0 ? '…' : '') + text.slice(from, to) + (to < text.length ? '…' : '');
}

// 네이버 검색 API는 2026년 7월 31일부터 NAVER API HUB(네이버 클라우드)에서만 새 키를 준다.
// HUB 키를 먼저 쓰고, 예전 개발자센터 키(2027년 6월 30일까지 동작)면 예전 주소로 다시 시도한다.
async function callNaver(kind, query, id, secret) {
  var qs = 'query=' + encodeURIComponent(query) + '&display=100&sort=sim';
  try {
    return await getJson('https://naverapihub.apigw.ntruss.com/search/v1/' + kind + '?' + qs,
      { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret });
  } catch (e) {
    if (!/HTTP (401|403)/.test(String(e && e.message))) throw e;
    return await getJson('https://openapi.naver.com/v1/search/' + kind + '.json?' + qs,
      { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret });
  }
}

async function searchNaver(kind, word, id, secret) {
  var data = await callNaver(kind, '"' + word + '"', id, secret);
  var items = (data && Array.isArray(data.items)) ? data.items : [];
  var hits = [];
  items.forEach(function (it) {
    var title = clean(it.title), desc = clean(it.description);
    var both = title + ' ' + desc;
    if (both.indexOf(word) >= 0) {
      hits.push({
        kind: kind === 'blog' ? '블로그' : '카페',
        title: title.slice(0, 80),
        text: snippet(desc.indexOf(word) >= 0 ? desc : title, word),
        link: /^https?:\/\//.test(it.link || '') ? it.link : '',
        date: /^\d{8}$/.test(it.postdate || '') ? it.postdate.slice(0, 4) + '.' + it.postdate.slice(4, 6) + '.' + it.postdate.slice(6) : '',
        // 서로 다른 블로그·카페가 몇 곳인지 세는 데만 쓰고, 응답에는 싣지 않는다
        src: String((kind === 'blog' ? (it.bloggerlink || it.bloggername) : (it.cafeurl || it.cafename)) || '').trim()
      });
    }
  });
  return { checked: items.length, hits: hits };
}

async function checkWeb(word) {
  var id = (process.env.NAVER_CLIENT_ID || '').trim(), secret = (process.env.NAVER_CLIENT_SECRET || '').trim();
  if (!id || !secret) return { status: 'off' };
  var w = word.replace(/\s+/g, ' ');
  var results = await Promise.allSettled([searchNaver('blog', w, id, secret), searchNaver('cafearticle', w, id, secret)]);
  var ok = results.filter(function (r) { return r.status === 'fulfilled'; }).map(function (r) { return r.value; });
  if (!ok.length) return { status: 'error', reason: why(results[0].reason) };
  var hits = [], checked = 0;
  ok.forEach(function (r) { checked += r.checked; hits = hits.concat(r.hits); });
  var level = hits.length >= USED_MIN ? 'used' : hits.length > 0 ? 'rare' : 'none';
  // 쓰임 정보: 서로 다른 곳 수 · 블로그/카페 글 수 · 블로그 글 날짜 범위 (검색 결과에 실제로 있는 값만)
  var srcs = {}, anySrc = false;
  hits.forEach(function (h) { if (h.src) { anySrc = true; srcs[(h.kind === '블로그' ? 'b:' : 'c:') + h.src] = 1; } });
  var dates = hits.map(function (h) { return h.date; }).filter(Boolean).sort();
  var blogs = hits.filter(function (h) { return h.kind === '블로그'; }).length;
  return {
    status: 'ok', partial: ok.length < 2, checked: checked, count: hits.length, level: level,
    sources: anySrc ? Object.keys(srcs).length : null, blogs: blogs, cafes: hits.length - blogs,
    firstDate: dates.length ? dates[0].slice(0, 7) : '', lastDate: dates.length ? dates[dates.length - 1].slice(0, 7) : '',
    samples: hits.slice(0, 3).map(function (h) { return { kind: h.kind, title: h.title, text: h.text, link: h.link, date: h.date }; })
  };
}

module.exports = async function handler(req, res) {
  var q = (req.query && req.query.w) || '';
  var word = validWord(Array.isArray(q) ? q[0] : q);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!word) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'bad-word' }));
    return;
  }
  var both = await Promise.all([checkDict(word), checkWeb(word)]);
  var out = { word: word, dict: both[0], web: both[1], checkedAt: new Date().toISOString().slice(0, 10) };
  var good = both[0].status === 'ok' && both[1].status === 'ok';
  // 같은 낱말은 하루 동안 저장해 두고 다시 묻지 않는다 (검색 사용량 절약)
  res.setHeader('Cache-Control', good ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'no-store');
  res.statusCode = 200;
  res.end(JSON.stringify(out));
};
module.exports._test = { validWord: validWord, clean: clean, bare: bare, snippet: snippet };
