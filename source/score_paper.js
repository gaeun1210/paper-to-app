// "AI 답 점검"(logic.js 의 checkAnswer)을 논문 연구자 분류와 비교해 채점한다.
// 실행: node score_paper.js <재현 패키지 폴더>   (연구1/responses.csv, 연구1/classified.csv, 연구2/classified_study2.csv 를 읽음)
// 규칙은 연구 1로만 다듬고 연구 2로 채점한다(같은 자료로 다듬고 채점하면 점수가 부풀려지므로).
'use strict';
var fs = require('fs'), path = require('path');
var L = require('../logic.js');
var dir = process.argv[2];
if (!dir) { console.log('재현 패키지 폴더를 넣어 주세요. 예: node score_paper.js ../../재현패키지'); process.exit(1); }
function parseCsv(text) {
  text = text.replace(/^﻿/, ''); var rows = [], row = [], f = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  var head = rows.shift();
  return rows.filter(function (r) { return r.length === head.length; }).map(function (r) { var o = {}; head.forEach(function (h, j) { o[h] = r[j]; }); return o; });
}
function read(p) { return parseCsv(fs.readFileSync(path.join(dir, p), 'utf8')); }
var text1 = {}; read('연구1/responses.csv').forEach(function (r) { text1[r['응답ID']] = r['응답 전문']; });
var s1 = read('연구1/classified.csv').map(function (c) { return { word: c['단어'], type: c['유형'], code: c['분류코드'], text: text1[c['응답ID']] || '' }; });
var s2 = read('연구2/classified_study2.csv').map(function (c) { return { word: c['단어'], type: c['유형'], code: c['분류코드'], text: c['응답 전문'] }; });
function kappa(pairs) {
  var n = pairs.length, po = pairs.filter(function (p) { return p[0] === p[1]; }).length / n, pe = 0;
  ['E', 'x'].forEach(function (c) { pe += (pairs.filter(function (p) { return p[0] === c; }).length / n) * (pairs.filter(function (p) { return p[1] === c; }).length / n); });
  return (po - pe) / (1 - pe);
}
function score(rows, label) {
  var out = rows.map(function (r) { return { r: r, app: L.checkAnswer(r.text, r.word).code }; });
  var pairs = out.map(function (o) { return [o.r.code === 'E' ? 'E' : 'x', o.app === 'E' ? 'E' : 'x']; });
  var fake = out.filter(function (o) { return o.r.type.indexOf('실제') < 0; }).map(function (o) { return [o.r.code === 'E' ? 'E' : 'x', o.app === 'E' ? 'E' : 'x']; });
  var agree = pairs.filter(function (p) { return p[0] === p[1]; }).length;
  var five = out.filter(function (o) { return o.r.code === o.app; }).length;
  console.log(label + ' ' + rows.length + '건 · E 판정 일치 ' + (agree / rows.length * 100).toFixed(1) + '% (카파 ' + kappa(pairs).toFixed(2) + ') · 가짜 단어만 카파 ' + kappa(fake).toFixed(2) + ' · 다섯 범주 일치 ' + (five / rows.length * 100).toFixed(1) + '%');
}
score(s1, '연구 1(규칙을 다듬는 데 씀)');
score(s2, '연구 2(채점에만 씀)');
