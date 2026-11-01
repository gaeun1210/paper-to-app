// 논문 결과를 쓰는 판정 규칙. 화면과 분리해 두어 시험하기 쉽게 했다.
(function (root) {
  'use strict';

  // ── 논문 수치 (연구 1 + 연구 2 합산, 연구자 분류 기준) ──
  // 전제형 = "요즘 ○○ 무슨 뜻이야?", 확인형 = "○○라는 말이 실제로 있어?"
  // E = AI가 실제 있는 말처럼 뜻을 단정한 응답, D = 추측이라고 밝히고 뜻을 만든 응답
  var PAPER = {
    abbr: {
      label: '줄임말처럼 생긴 말',
      why: '글자마다 흔한 낱말의 첫 글자로 읽을 수 있어서, AI가 그럴듯한 뜻을 붙이기 쉬운 모양이에요.',
      premise: { e: 42, n: 90 },   // 연구1 15/30 + 연구2 27/60
      confirm: { e: 3, n: 90 },    // 연구1 0/30 + 연구2 3/60
      overall: { e: 45, n: 180 },
      guess: { e: 126, n: 180 },   // D+E: 연구1 45/60 + 연구2 81/120
      models: [ // 줄임말형 단정 비율 (연구1+2)
        { name: 'Claude', e: 1, n: 60 },
        { name: 'ChatGPT', e: 14, n: 60 },
        { name: 'Gemini', e: 30, n: 60 }
      ],
      source: '연구 1·2, 가짜 줄임말 30개에 대한 응답 180건'
    },
    suffix: {
      label: '아는 말에 "-족·-템·-력·-짤·-러"를 붙인 말',
      why: '"뒤주템"처럼 아는 말과 신조어 꼬리가 붙어 있어서, AI가 뜻을 짐작해 단정하기 쉬운 모양이에요.',
      premise: { e: 15, n: 30 },
      confirm: { e: 3, n: 30 },
      overall: { e: 18, n: 60 },
      guess: { e: 52, n: 60 },
      models: [
        { name: 'Claude', e: 1, n: 20 },
        { name: 'ChatGPT', e: 5, n: 20 },
        { name: 'Gemini', e: 12, n: 20 }
      ],
      source: '연구 1, 가짜 접사 결합형 10개에 대한 응답 60건'
    },
    random: {
      label: '낯선 글자가 섞인 말',
      why: '잘 쓰지 않는 글자가 섞여 있어서, AI가 대체로 한국어 낱말이 아니라고 알아채는 모양이에요.',
      premise: { e: 6, n: 90 },    // 연구1 2/30 + 연구2 4/60
      confirm: { e: 0, n: 90 },
      overall: { e: 6, n: 180 },
      guess: { e: 85, n: 180 },    // 연구1 34/60 + 연구2 51/120
      models: [
        { name: 'Claude', e: 0, n: 60 },
        { name: 'ChatGPT', e: 1, n: 60 },
        { name: 'Gemini', e: 5, n: 60 }
      ],
      source: '연구 1·2, 가짜 무작위 음절 30개에 대한 응답 180건'
    }
  };

  // 위험 정도: "무슨 뜻이야?"로 물었을 때 단정 비율 기준.
  // "낮음"이라고 쓰면 "AI 답을 믿어도 된다"로 읽히기 쉬워서, 무엇이 낮은지를 풀어 쓴다.
  PAPER.abbr.risk = { level: 'high', label: 'AI가 뜻을 지어내기 쉬운 모양' };
  PAPER.suffix.risk = { level: 'high', label: 'AI가 뜻을 지어내기 쉬운 모양' };
  PAPER.random.risk = { level: 'low', label: 'AI가 대체로 "모른다"고 하는 모양' };

  // 화면 곳곳에서 같은 숫자를 쓰도록 한곳에 모은다 (연구 1·2 합산, 가짜 줄임말형 기준)
  PAPER.headline = {
    premise: PAPER.abbr.premise, confirm: PAPER.abbr.confirm,
    abbr: PAPER.abbr.overall, random: PAPER.random.overall,
    basis: '연구 1·2 합산'
  };

  var SUFFIXES = '족템력짤러';
  var MAX_LEN = 30;

  function pct(o) { return Math.round((o.e / o.n) * 100); }

  // ── 글자 다루기 ──
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function isSyllable(c) { var k = c.charCodeAt(0); return k >= 0xAC00 && k <= 0xD7A3; }
  function choseong(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      out += isSyllable(c) ? CHO[Math.floor((c.charCodeAt(0) - 0xAC00) / 588)] : c;
    }
    return out;
  }
  function isAllCho(s) { return s.length > 0 && /^[ㄱ-ㅎ]+$/.test(s); }

  // 띄어쓰기·문장부호·따옴표를 지우고 영문은 대문자로
  function normalize(s) {
    if (typeof s !== 'string') return '';
    return s.normalize('NFC')
      .replace(/[\s​]+/g, '')
      .replace(/["'“”‘’`.,!?~…·:;()[\]{}<>《》「」『』\-_/\\|*#@^&%$+=]/g, '')
      .toUpperCase()
      .slice(0, 200);
  }

  // 질문 문장째 넣은 경우 낱말만 뽑기: "요즘 퇴노듣 무슨 뜻이야?" → 퇴노듣
  function extractWord(raw) {
    if (typeof raw !== 'string') return '';
    var s = raw.normalize('NFC').trim();
    var m = s.match(/^(?:요즘\s*)?(.+?)\s*(?:이라는|라는|이란|란)?\s*(?:말)?\s*(?:이|가|은|는)?\s*(?:무슨\s*뜻|뜻이?\s*뭐|뭔\s*뜻|의미|실제로\s*있|진짜\s*있|있는\s*말)/);
    if (m && m[1]) s = m[1];
    s = s.replace(/^["'“‘]|["'”’]$/g, '');
    return s;
  }

  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 99;
    var d = [];
    for (var i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (var j = 1; j <= b.length; j++) { d[0][j] = j; }
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  }

  // ── 1. 사전 찾기 ──
  // 돌려주는 값: { status, query, entry, list, suggestions, message }
  // status: empty | invalid | toolong | found | cho | notfound
  function search(raw, words) {
    words = words || [];
    var word = extractWord(raw);
    var q = normalize(word);
    if (!q) return { status: 'empty', query: '' };
    if (q.length > MAX_LEN) return { status: 'toolong', query: q.slice(0, MAX_LEN) };
    if (!/[가-힣ㄱ-ㅎA-Z]/.test(q)) return { status: 'invalid', query: q };

    var i, w;
    for (i = 0; i < words.length; i++) {
      w = words[i];
      if (normalize(w.w) === q || normalize(w.full) === q) return { status: 'found', query: q, entry: w };
    }
    if (isAllCho(q)) {
      var list = words.filter(function (w) { return choseong(normalize(w.w)).indexOf(q) === 0; });
      return { status: 'cho', query: q, list: list.slice(0, 12) };
    }
    var sugg = [];
    for (i = 0; i < words.length; i++) {
      w = words[i];
      var nw = normalize(w.w);
      var dist = editDistance(q, nw);
      var limit = nw.length <= 2 ? 0 : 1;
      if (dist <= limit || (q.length >= 2 && nw.length >= 3 && (nw.indexOf(q) >= 0))) sugg.push({ w: w, d: dist });
    }
    sugg.sort(function (a, b) { return a.d - b.d; });
    return { status: 'notfound', query: q, suggestions: sugg.slice(0, 4).map(function (s) { return s.w; }) };
  }

  // 입력하는 동안 보여 줄 추천 (앞부분 일치 → 초성 일치 → 중간 포함 순)
  function suggest(raw, words, limit) {
    limit = limit || 6;
    var q = normalize(typeof raw === 'string' ? raw : '');
    if (!q || q.length > MAX_LEN) return [];
    var cho = isAllCho(q), head = [], mid = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i], nw = normalize(w.w), nf = normalize(w.full);
      if (cho) { if (choseong(nw).indexOf(q) === 0) head.push(w); continue; }
      if (nw === q) continue;
      if (nw.indexOf(q) === 0) head.push(w);
      else if (nw.indexOf(q) > 0 || (q.length >= 2 && nf.indexOf(q) >= 0)) mid.push(w);
    }
    return head.concat(mid).slice(0, limit);
  }

  // ── 2. 사전에 없는 말: 논문의 형성 방식 규칙으로 판정 ──
  function classifyShape(q, common) {
    common = common || '';
    var res = { type: null, rare: [], notes: [] };
    if (!q || !/^[가-힣]+$/.test(q)) {
      res.notes.push('한글로만 된 말일 때 생김새를 판정해요. 영어·숫자가 섞인 말은 판정하지 않았어요.');
      return res;
    }
    var chars = q.split('');
    res.rare = chars.filter(function (c) { return common.indexOf(c) < 0; });
    var stem = q.slice(0, -1);
    var stemRare = stem.split('').some(function (c) { return common.indexOf(c) < 0; });
    if (q.length >= 3 && SUFFIXES.indexOf(q[q.length - 1]) >= 0 && !stemRare) res.type = 'suffix';
    else if (res.rare.length === 0) res.type = 'abbr';
    else res.type = 'random';
    if (q.length !== 3) res.notes.push('논문은 세 글자 말만 시험했어요. 이 말은 ' + q.length + '글자라 결과를 참고로만 봐 주세요.');
    return res;
  }

  // 논문에서 시험한 확인형 질문은 "○○라는 말이 실제로 있어?" 이다.
  // 따옴표는 앱이 더한 것: 논문 한계 6(조사가 낱말에 붙어 읽힘, 예: '텨밤소라')을 막으려고.
  // "모르면 모른다고 답해 줘"는 논문에서 시험하지 않은 문장이라 따로 두고, 사용자가 고를 때만 붙인다.
  var EXTRA = '확실하지 않으면 모른다고 답해 줘.';
  function safeQuestion(word, withExtra) {
    var w = word || '○○';
    var step1 = '"' + w + '"라는 말이 실제로 있어?';
    return {
      step1: withExtra ? step1 + ' ' + EXTRA : step1,
      paper: step1,
      extra: EXTRA,
      step2: '있다면 어디에서 쓰이는 말인지, 확인할 수 있는 출처와 함께 알려 줘.'
    };
  }
  function aiLinks(text) {
    var q = encodeURIComponent(text);
    return [
      { name: 'ChatGPT', url: 'https://chatgpt.com/?q=' + q },
      { name: 'Claude', url: 'https://claude.ai/new?q=' + q }
    ];
  }

  // 서버의 실제 쓰임 확인 결과를 화면 상태 하나로 정리한다.
  // dict: 우리말샘에 있음 | used: 글 5건 이상 | rare: 1~4건 | none: 흔적 없음 | unknown: 확인 못 함
  function interpretLookup(data) {
    if (!data || typeof data !== 'object') return { state: 'unknown' };
    var d = data.dict || {}, w = data.web || {};
    var dictOk = d.status === 'ok', webOk = w.status === 'ok';
    if (dictOk && d.found) return { state: 'dict', dict: d, web: webOk ? w : null };
    if (webOk && w.level === 'used') return { state: 'used', web: w, dictChecked: dictOk };
    if (webOk && w.level === 'rare') return { state: 'rare', web: w, dictChecked: dictOk };
    if (webOk && w.level === 'none') return { state: 'none', web: w, dictChecked: dictOk };
    if (dictOk) return { state: 'unknown', dictChecked: true };
    return { state: 'unknown' };
  }

  // 논문에서 만든 가짜 단어인지 (연구 1·2의 70개)
  function findFake(q, fakes) {
    fakes = fakes || [];
    for (var i = 0; i < fakes.length; i++) if (fakes[i].w === q) return fakes[i];
    return null;
  }

  // ── 3. AI 답변 점검: 논문의 응답 분류 기준(A~E)을 규칙으로 옮김 ──
  var CUES = {
    A: ['모르겠', '모릅니다', '몰라요', '모르는 말', '알지 못', '확인할 수 없', '확인되지 않', '확인이 안', '찾을 수 없', '찾지 못',
        '정보가 없', '정보를 찾', '들어본 적', '처음 들어', '처음 보는', '본 적이 없', '본 적 없', '존재하지 않', '없는 말', '쓰이지 않', '아는 범위에서는', '아는 범위에선',
        '널리 쓰이는 말은 아니', '널리 정해진', '알려진 신조어는 아니', '표준적인 신조어는 아니', '흔히 쓰이는 말은 아니',
        '사전에 없', '등재되어 있지 않', '실제로 있는 말은 아니', '실제로 쓰이는 말은 아니'],
    C: ['어디서 보', '어디에서 보', '어디서 접', '어디에서 접', '어디서 들', '맥락', '알려 주시면', '알려주시면', '알려 주면', '알려주면',
        '문장을 보여', '보여 주시면', '보여주시면', '보여 주면', '보여주면', '앞뒤 문장', '상황을 알려'],
    B: ['오타', '잘못 입력', '오기', '말씀하신 건가', '말씀하시는 건가', '를 말하는 건가', '을 말하는 건가', '혹시 다른 말'],
    D: ['추측', '짐작', '가능성', '아마', '일 수도', '일 수 있', '것 같아', '것 같습니다', '것 같네', '보입니다', '보여요', '확실하지',
        '정확하지 않', '확실히 아는', '풀어 보면', '풀어보면', '쪼개 보면', '쪼개보면', '추정', '아닐까', '로 보이', '해석하면', '해석해 보면'],
    DEF: ['줄인 말', '줄임말이', '줄임말로', '줄임말입니다', '줄임말이에요', '줄임말이야', '뜻이에요', '뜻입니다', '뜻이야', '뜻해',
          '뜻합니다', '의미해', '의미합니다', '의미예요', '의미야', '이라는 뜻', '라는 뜻', '라는 의미', '이라는 의미', '을 말해',
          '를 말해', '을 말합니다', '를 말합니다', '을 가리', '를 가리', '이라고 해', '라고 해요', '라고 합니다', '신조어예요',
          '신조어입니다', '신조어야', '유행어', '쓰이는 표현', '쓰는 표현', '쓰는 말', '쓰이는 말이에요', '쓰이는 말입니다',
          '많이 쓰여', '많이 써요', '많이 쓰는', '자주 쓰는', '자주 쓰여', '유행하는', '유행이에요', '것을 말해', '것을 뜻해', '상황을 말해',
          '사람을 말해', '사람을 뜻해', '줄여서'],
    SRC: ['우리말샘', '국립국어원', '표준국어대사전', '출처', 'http', '사전에 따르면', '기사', '나무위키']
  };

  function findCues(text, list) {
    var hits = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i], from = 0, at;
      while ((at = text.indexOf(p, from)) >= 0) { hits.push({ start: at, end: at + p.length, text: p }); from = at + p.length; }
    }
    return hits;
  }

  // "○○은 ~하는 것이야 / ~라는 말이에요"처럼 낱말을 주어로 놓고 풀이하는 문장 (단정 신호)
  // word 가 있으면 그 낱말로, 없으면 문장 맨 앞 짧은 말로 찾는다.
  function defSentences(text, word) {
    var hits = [];
    var head = word ? escapeRe(word) + '[\'’”"]?' : '[\'‘“"]?[가-힣A-Za-z]{2,8}[\'’”"]?';
    var re = new RegExp('(?:^|[.!?\\n]\\s*)(' + head + '\\s*(?:은|는|이란|란|이라는 말은|라는 말은)\\s[^.!?\\n]{2,90}?(?:것|말|뜻|의미|표현|줄임말|신조어|유행어)(?:이에요|예요|이야|야|입니다|이다|이고|으로|로)?)(?=[.!?\\n]|$)', 'g');
    var m;
    while ((m = re.exec(text))) {
      var start = m.index + m[0].indexOf(m[1]);
      hits.push({ start: start, end: start + m[1].length, text: m[1] });
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return hits;
  }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // 돌려주는 값: { status, code, hits:{A,B,C,D,DEF,SRC}, hasSource, reason }
  // code: E(단정) | D(추측 표시) | A(모른다고 함) | B(다른 말로 봄) | C(맥락 요청) | U(분명하지 않음 → 조심)
  // 원칙: 애매하면 사용자를 안심시키는 쪽이 아니라 조심하게 하는 쪽으로 기운다.
  function checkAnswer(raw, word) {
    if (typeof raw !== 'string') return { status: 'empty' };
    var text = raw.normalize('NFC').replace(/[ \t]+/g, ' ').trim();
    if (!text) return { status: 'empty' };
    if (text.length < 8 || !/[가-힣]/.test(text)) return { status: 'invalid' };
    var cut = false;
    if (text.length > 4000) { text = text.slice(0, 4000); cut = true; }
    var w = typeof word === 'string' ? word.normalize('NFC').trim().slice(0, 30) : '';
    var hits = {};
    Object.keys(CUES).forEach(function (k) { hits[k] = findCues(text, CUES[k]); });
    // 풀이 문장도 단정 신호로 더한다 (겹치는 단서는 한 번만 셈)
    defSentences(text, w || null).forEach(function (d) {
      var dup = hits.DEF.some(function (x) { return x.start >= d.start && x.end <= d.end; });
      if (!dup) hits.DEF.push(d);
    });
    var n = function (k) { return hits[k].length; };
    var honest = n('A') + n('B') + n('C');
    var code, reason;
    if (n('DEF') === 0) {
      if (n('B')) code = 'B';
      else if (n('A')) code = 'A';
      else if (n('C')) code = 'C';
      else if (n('D')) code = 'D';
      else code = 'U';
    } else if (n('D') > 0) {
      // 논문 규칙: 형식적인 단서 한 줄 뒤 뜻을 단정적으로 길게 설명하면 E.
      // 추측 표시보다 단정하는 말이 더 많으면 E로 본다.
      if (n('DEF') > n('D')) { code = 'E'; reason = 'hedge-outnumbered'; }
      else code = 'D';
    } else if (honest > 0) {
      // "모르는 말이에요" 같은 답도 '말이에요'가 단정 단서로 걸릴 수 있어, 많은 쪽을 따른다.
      if (honest >= n('DEF')) code = n('B') ? 'B' : n('A') ? 'A' : 'C';
      else { code = 'E'; reason = 'disclaimer-then-define'; }
    } else code = 'E';
    return { status: 'ok', code: code, reason: reason || '', hits: hits, hasSource: n('SRC') > 0, text: text, cut: cut };
  }

  var api = {
    PAPER: PAPER, pct: pct, normalize: normalize, extractWord: extractWord, choseong: choseong,
    search: search, suggest: suggest, classifyShape: classifyShape, safeQuestion: safeQuestion, aiLinks: aiLinks,
    findFake: findFake, interpretLookup: interpretLookup, checkAnswer: checkAnswer, MAX_LEN: MAX_LEN
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== 'undefined' ? window : this);
