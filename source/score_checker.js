// "AI 답 믿어도 될까?"의 자동 판정을 논문 연구자 분류와 비교해 채점한다.
//
// 실행 (source 폴더에서, Node.js 18 이상):
//   node score_checker.js ../../재현패키지/연구1/classified.csv ../../재현패키지/연구2/classified_study2.csv
//
// 결과:
//   - 화면에 일치율과 혼동표를 출력
//   - ../checker_score.js 를 만든다 → 앱의 "AI 답 믿어도 될까?" 아래에 일치율이 표시된다
//
// 열 이름은 자동으로 찾는다. 못 찾으면 열 목록을 보여 주니, 아래처럼 직접 지정한다.
//   node score_checker.js 파일.csv --text 응답열이름 --code 연구자코드열이름 [--word 단어열이름] [--type 유형열이름]
'use strict';
var fs = require('fs');
var path = require('path');
var L = require('../logic.js');

// ── 인자 ──
var args = process.argv.slice(2), files = [], opt = {};
for (var i = 0; i < args.length; i++) {
  if (args[i].slice(0, 2) === '--') { opt[args[i].slice(2)] = args[i + 1]; i++; }
  else files.push(args[i]);
}
if (!files.length) {
  console.log('채점할 CSV 파일 경로를 넣어 주세요. 예: node score_checker.js ../../연구1/classified.csv');
  process.exit(1);
}

// ── 따옴표·줄바꿈이 든 CSV도 읽는 작은 파서 ──
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  var rows = [], row = [], cell = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ''; }); });
}

var GUESS = {
  text: ['response', 'response_text', 'answer', 'text', 'output', '응답', '응답전문', '응답 내용', '답변'],
  code: ['researcher_code', 'code_researcher', 'final_code', 'code', 'human_code', '연구자', '연구자코드', '연구자 코드', '최종코드', '코드'],
  word: ['word', 'term', '단어', '낱말'],
  type: ['type', 'word_type', '유형']
};
function pick(header, key) {
  if (opt[key]) return header.indexOf(opt[key]);
  var lower = header.map(function (h) { return h.trim().toLowerCase(); });
  for (var i = 0; i < GUESS[key].length; i++) { var at = lower.indexOf(GUESS[key][i].toLowerCase()); if (at >= 0) return at; }
  return -1;
}

var CODES = ['A', 'B', 'C', 'D', 'E'];
var all = [];
files.forEach(function (f) {
  var rows = parseCsv(fs.readFileSync(f, 'utf8'));
  var head = rows[0], ti = pick(head, 'text'), ci = pick(head, 'code'), wi = pick(head, 'word'), yi = pick(head, 'type');
  if (ti < 0 || ci < 0) {
    console.log('\n[' + f + '] 응답 열 또는 연구자 코드 열을 찾지 못했어요. 열 목록:');
    console.log('  ' + head.join(' | '));
    console.log('--text 와 --code 로 열 이름을 지정해 다시 실행해 주세요.');
    process.exit(1);
  }
  console.log('[' + path.basename(f) + '] 응답 열 "' + head[ti] + '", 연구자 코드 열 "' + head[ci] + '"' + (wi >= 0 ? ', 단어 열 "' + head[wi] + '"' : ''));
  rows.slice(1).forEach(function (r) {
    var human = (r[ci] || '').trim().toUpperCase();
    if (CODES.indexOf(human) < 0) return; // 실패 기록·빈 줄은 뺀다
    var type = yi >= 0 ? (r[yi] || '').trim() : '';
    all.push({ text: r[ti] || '', human: human, word: wi >= 0 ? (r[wi] || '').trim() : '', type: type });
  });
});

// 실제 신조어 대조군은 앱이 점검할 대상(모르는 말에 대한 답)과 성격이 달라 따로 센다
function isReal(x) { return /^(real|control|n\b|n\d|실제|대조)/i.test(x.type); }

function score(list) {
  var n = 0, same = 0, eSame = 0, tp = 0, fp = 0, fn = 0, tn = 0, conf = {};
  list.forEach(function (x) {
    var r = L.checkAnswer(x.text, x.word);
    var app = r.status === 'ok' ? r.code : 'U';
    n++;
    if (app === x.human) same++;
    var a = app === 'E' || app === 'U', hE = x.human === 'E'; // U(분명하지 않음)는 앱이 "조심"으로 안내하므로 E 쪽으로 센다
    if (a === hE) eSame++;
    if (a && hE) tp++; else if (a && !hE) fp++; else if (!a && hE) fn++; else tn++;
    conf[x.human] = conf[x.human] || {}; conf[x.human][app] = (conf[x.human][app] || 0) + 1;
  });
  var po = eSame / n, pe = ((tp + fp) / n) * ((tp + fn) / n) + ((fn + tn) / n) * ((fp + tn) / n);
  return {
    n: n, exact: same / n, e: po, kappa: pe < 1 ? (po - pe) / (1 - pe) : 1,
    missedE: fn, missedERate: (tp + fn) ? fn / (tp + fn) : 0, falseAlarm: fp, conf: conf
  };
}
function pct(x) { return (x * 100).toFixed(1) + '%'; }

var fake = all.filter(function (x) { return !isReal(x); });
var real = all.filter(isReal);
var s = score(fake.length ? fake : all);
console.log('\n가짜 단어 응답 ' + s.n + '건 (실제 신조어 대조군 ' + real.length + '건은 뺌)');
console.log('  다섯 범주 완전 일치  ' + pct(s.exact));
console.log('  "단정(E)인가" 일치   ' + pct(s.e) + '  (카파 ' + s.kappa.toFixed(2) + ')');
console.log('  연구자는 E인데 앱이 E/U로 안 본 것(안심시키는 오판) ' + s.missedE + '건 · E의 ' + pct(s.missedERate));
console.log('  연구자는 E가 아닌데 앱이 조심하라고 한 것 ' + s.falseAlarm + '건');
console.log('\n혼동표 (행 = 연구자, 열 = 앱)');
console.log('      ' + CODES.concat('U').map(function (c) { return (c + '    ').slice(0, 5); }).join(''));
CODES.forEach(function (h) {
  var row = s.conf[h] || {};
  console.log('  ' + h + '   ' + CODES.concat('U').map(function (c) { return (String(row[c] || 0) + '    ').slice(0, 5); }).join(''));
});

var out = path.join(__dirname, '..', 'checker_score.js');
fs.writeFileSync(out, '// 자동 생성 (source/score_checker.js). 논문 응답으로 앱의 답변 점검을 채점한 결과\n' +
  'window.CHECKER_SCORE = ' + JSON.stringify({
    n: s.n, exact: +s.exact.toFixed(3), e: +s.e.toFixed(3), kappa: +s.kappa.toFixed(2),
    missedE: s.missedE, missedERate: +s.missedERate.toFixed(3), date: new Date().toISOString().slice(0, 10)
  }) + ';\n');
console.log('\n→ ' + out + ' 를 만들었어요. 앱 화면에 일치율이 표시돼요.');
