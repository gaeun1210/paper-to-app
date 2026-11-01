(function () {
  'use strict';
  var L = window.Logic;
  var WORDS = window.WORDS || [];
  var COMMON = window.COMMON || '';
  var FAKES = window.PAPER_FAKES || [];
  var CONFIG = window.APP_CONFIG || {};
  var SCORE = window.CHECKER_SCORE || null;
  var P = L.PAPER, HL = P.headline;

  // ── 작은 도우미 ──
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k]; // 앱이 직접 만든 고정 그림(SVG)에만 씀
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  var $ = function (id) { return document.getElementById(id); };
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function copy(text, done) {
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); toast(done || '복사했어요'); } catch (e) { toast('복사하지 못했어요. 길게 눌러 직접 복사해 주세요.'); }
      ta.remove();
    }
    try {
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(done || '복사했어요'); }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  function shareLink(params, title) {
    var base = location.protocol === 'file:' ? location.href.split('?')[0] : location.origin + location.pathname;
    var url = base + '?' + new URLSearchParams(params).toString();
    if (navigator.share) navigator.share({ title: title, url: url }).catch(function () {});
    else copy(url, '링크를 복사했어요');
  }
  function setUrl(params) {
    try {
      var qs = new URLSearchParams(params).toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    } catch (e) { /* file:// 등에서는 무시 */ }
  }
  function msg(text) { return h('div', { class: 'msg', text: text }); }
  function pctText(o) { return L.pct(o) + '%'; }
  function safeLink(url) { return /^https?:\/\//.test(url || '') ? url : null; }

  // ── 최근 찾은 말 (이 기기에만 저장. 저장이 막힌 브라우저에서는 조용히 건너뜀) ──
  var RKEY = 'jinjja.recent.v1';
  function loadRecent() {
    try { var a = JSON.parse(localStorage.getItem(RKEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }).slice(0, 8) : []; }
    catch (e) { return []; }
  }
  function saveRecent(word) {
    if (!word) return;
    var list = loadRecent().filter(function (x) { return x !== word; });
    list.unshift(word);
    try { localStorage.setItem(RKEY, JSON.stringify(list.slice(0, 8))); } catch (e) { /* 무시 */ }
    renderRecent();
  }
  function renderRecent() {
    var list = loadRecent(), box = $('recent-list');
    box.textContent = '';
    list.forEach(function (w) { box.appendChild(h('button', { class: 'chip', type: 'button', text: w, onclick: function () { runFind(w); } })); });
    $('recent').hidden = list.length === 0;
  }
  $('recent-clear').addEventListener('click', function () {
    try { localStorage.removeItem(RKEY); } catch (e) { /* 무시 */ }
    renderRecent(); toast('최근 찾은 말을 지웠어요');
  });

  // ── 탭 ──
  var tabs = [$('tab-find'), $('tab-check'), $('tab-quiz')];
  function selectTab(which, focus) {
    tabs.forEach(function (t) {
      var on = t.id === 'tab-' + which;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
      if (on && focus) t.focus();
    });
    if (which === 'quiz' && !quizStarted) renderQuizIntro();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t.id.replace('tab-', '')); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        selectTab(next.id.replace('tab-', ''), true);
      }
    });
  });

  // ── 결과 카드 공통 조각 ──
  function verdict(sealText, sealCls, word, sub) {
    return h('div', { class: 'verdict' }, [
      h('div', { class: 'seal stamp ' + (sealCls || ''), 'aria-hidden': 'true' }, [h('span', { text: sealText })]),
      h('div', null, [h('h2', { class: 'head', text: word }), sub ? h('p', { class: 'sub', text: sub }) : null])
    ]);
  }
  function srOnly(text) { return h('p', { class: 'visually-hidden', text: text }); }

  function qbox(label, text, note) {
    return h('div', { class: 'qbox' }, [
      h('div', { class: 'qtext' }, [h('span', { class: 'step', text: label }), h('q', { text: text }), note ? h('span', { class: 'qnote', text: note }) : null]),
      h('button', { class: 'ghost small', type: 'button', text: '복사', 'aria-label': label + ' 질문 복사', onclick: function () { copy(text, '질문을 복사했어요'); } })
    ]);
  }

  // 논문에서 시험한 질문 + (고르면) 덧붙이는 문장 + AI 바로 열기
  function questionBlock(word, title) {
    var withExtra = false;
    var box = h('div', { class: 'qwrap' });
    function paint() {
      var sq = L.safeQuestion(word, withExtra);
      box.textContent = '';
      box.appendChild(qbox('먼저', sq.step1, withExtra ? '앞 문장은 논문에서 시험한 질문, 뒤 문장은 앱이 덧붙인 문장이에요.' : '논문에서 AI가 뜻을 가장 덜 지어낸 질문이에요. 따옴표는 낱말이 조사와 붙어 읽히지 않게 앱이 더했어요.'));
      box.appendChild(h('div', { class: 'open-row' }, [h('span', { class: 'open-l', text: '이 질문으로 바로 열기' })].concat(L.aiLinks(sq.step1).map(function (a) {
        return h('a', { class: 'open-ai', href: a.url, target: '_blank', rel: 'noopener', text: a.name + ' ↗' });
      }))));
      box.appendChild(qbox('있다고 하면', sq.step2));
    }
    var extra = h('label', { class: 'extra' }, [
      h('input', { type: 'checkbox', onchange: function (e) { withExtra = e.target.checked; paint(); } }),
      ' “' + L.safeQuestion(word).extra + '” 덧붙이기 ',
      h('span', { class: 'opt', text: '(논문에서 시험하지 않은 문장)' })
    ]);
    paint();
    return h('div', { class: 'block ask-block' }, [h('h3', { text: title || 'AI에게 묻는다면 이렇게 물어보세요' }), box, extra]);
  }

  function shapeOf(q) {
    var shape = L.classifyShape(q, COMMON);
    var ok = shape.type && /^[가-힣]{3}$/.test(q);
    return { shape: shape, info: ok ? P[shape.type] : null };
  }

  // 생김새에 따른 논문 수치 (세 글자 한글 말일 때만)
  function riskBlock(q) {
    var s = shapeOf(q), I = s.info;
    if (!I) {
      return s.shape.notes.length ? h('p', { class: 'src', text: s.shape.notes[0] + ' 생김새에 따른 논문 수치는 보여 드리지 않아요.' }) : null;
    }
    var body = I === P.random
      ? ['이런 모양의 가짜 말은 “무슨 뜻이야?”로 물어도 AI가 ', h('b', { text: pctText(I.premise) }), '만 뜻을 단정했어요. 그래도 “추측”이라며 뜻을 지어 준 답까지 치면 ', h('b', { text: pctText(I.guess) }), '였으니 안심하지는 마세요.']
      : ['이런 모양의 가짜 말을 AI에게 “무슨 뜻이야?”라고 물으면 ', h('b', { text: pctText(I.premise) + '(10번 중 약 ' + Math.round(L.pct(I.premise) / 10) + '번)' }), '가 뜻을 지어냈어요. “실제로 있어?”라고 물으면 ', h('b', { text: pctText(I.confirm) }), '였어요.'];
    return h('div', { class: 'risk ' + I.risk.level }, [
      h('span', { class: 'risk-tag', text: I.risk.label }),
      h('p', null, body),
      h('p', { class: 'src', text: '생김새: ' + I.label + ' · ' + I.source })
    ]);
  }

  function paperDetail(q, display) {
    var s = shapeOf(q), I = s.info, kids = [h('summary', { text: '논문 근거 자세히 보기' })];
    if (I) {
      kids.push(h('p', null, ['생김새: ', h('b', { text: I.label }), '. ', I.why]));
      kids.push(h('div', { class: 'bars' }, [bar('“' + display + ' 무슨 뜻이야?”', I.premise), bar('“' + display + '라는 말이 실제로 있어?”', I.confirm, true)]));
      kids.push(h('ul', { class: 'models', 'aria-label': 'AI별로 뜻을 단정한 비율' }, I.models.map(function (m) {
        return h('li', null, [m.name + ' ', h('b', { text: L.pct(m) + '%' })]);
      })));
      kids.push(h('p', { class: 'src', text: '수치는 ' + I.source + ' (두 질문 방식, 세 AI 각 회사 API로 물은 결과).' }));
    } else {
      kids.push(h('p', { text: '논문은 한글 세 글자 가짜 말만 시험했어요. 그래도 “무슨 뜻이야?”보다 “실제로 있어?”라고 물을 때 AI가 훨씬 덜 지어냈다는 결과(가짜 줄임말 ' + pctText(HL.premise) + ' → ' + pctText(HL.confirm) + ')는 참고할 수 있어요.' }));
    }
    return h('details', { class: 'why' }, kids);
  }

  function bar(label, o, safe) {
    var p = L.pct(o);
    return h('div', { class: 'bar' + (safe ? ' safe' : '') }, [
      h('span', { class: 'ask', text: label }),
      h('div', { class: 'track', role: 'img', 'aria-label': label + ' ' + p + '퍼센트' }, [h('div', { class: 'fill', style: 'width:' + Math.max(p, 1) + '%' })]),
      h('span', { class: 'num' }, [h('b', { text: p + '%' }), '가 뜻을 단정 (' + o.e + '/' + o.n + '건)'])
    ]);
  }

  function actions(display, withCheck) {
    return h('div', { class: 'actions' }, [
      withCheck ? h('button', { class: 'link', type: 'button', text: '받은 AI 답 점검하기', onclick: function () { $('cw').value = display; selectTab('check', true); $('ca').focus(); } }) : null,
      h('button', { class: 'link', type: 'button', text: '이 결과 공유하기', onclick: function () { shareLink({ q: display }, display + ' · 진짜 있는 말?'); } }),
      CONFIG.reportUrl && safeLink(CONFIG.reportUrl) ? h('a', { class: 'link', href: CONFIG.reportUrl, target: '_blank', rel: 'noopener', text: '빠진 말 알려 주기' }) : null
    ]);
  }

  function marked(text, word) {
    var i = word ? text.indexOf(word) : -1;
    if (i < 0) return [text];
    return [text.slice(0, i), h('mark', { class: 'hit', text: word }), text.slice(i + word.length)];
  }
  function samplesBlock(web, word) {
    if (!web || !web.samples || !web.samples.length) return null;
    return h('div', { class: 'block' }, [
      h('h3', { text: '실제로 쓰인 글' }),
      h('ul', { class: 'samples' }, web.samples.map(function (s) {
        var link = safeLink(s.link);
        return h('li', null, [
          h('p', { class: 'stext' }, marked(s.text || s.title || '', word)),
          h('p', { class: 'smeta' }, [s.kind + (s.date ? ' · ' + s.date : '') + ' · ', link ? h('a', { href: link, target: '_blank', rel: 'noopener', text: '원문 보기' }) : '원문 주소 없음'])
        ]);
      })),
      h('p', { class: 'src', text: '같은 글자라도 사람 이름·가게 이름처럼 다른 뜻일 수 있어요. 글을 열어 직접 확인해 보세요.' })
    ]);
  }

  // ── 1. 말 찾기 ──
  var findOut = $('find-result');
  var CAUTION = {
    '속된 말': '점잖지 않은 말이에요. 친한 사이에서 장난으로 쓰지만, 어른께나 공적인 자리에서는 피하는 게 좋아요.',
    '놀리는 말': '상대를 놀릴 때 쓰는 말이에요. 듣는 사람이 기분 나쁠 수 있어요.',
    '낮잡는 말': '어떤 사람들을 낮잡아 부르는 말이에요. 듣는 사람에게 상처가 될 수 있어요.',
    '무례한 말': '상대를 무시하는 느낌을 주는 말이에요. 듣는 사람이 기분 나쁠 수 있어요.'
  };

  function entryCard(w) {
    var badges = [h('span', { class: 'badge ok', text: w.src === 'paper' ? '우리말샘 등재 확인' : '이 앱 사전' })];
    if (w.cat) badges.push(h('span', { class: 'badge', text: w.cat }));
    badges.push(h('span', { class: 'badge', text: '기준일 ' + window.DICT_DATE }));
    return h('article', { class: 'entry s-ok' }, [
      verdict('확인된\n뜻 있음', 'ok', w.w, w.full),
      srOnly('판정: 확인된 뜻 있음'),
      w.note ? h('div', { class: 'caution', role: 'note' }, [
        h('span', { class: 'caution-icon', 'aria-hidden': 'true', text: '!' }),
        h('p', null, [h('b', { class: 'cb', text: w.note }), CAUTION[w.note] || '쓸 때 주의가 필요한 말이에요.'])
      ]) : null,
      h('p', { class: 'mean', text: w.m }),
      w.e ? h('p', { class: 'ex', text: w.e }) : null,
      h('div', { class: 'meta' }, badges),
      actions(w.w, false)
    ]);
  }

  // 논문에서 일부러 만든 가짜 말
  function fakeCard(f, display) {
    var typeName = P[f.type] ? P[f.type].label : '';
    var kids = [
      verdict('논문의\n가짜 말', '', display, '논문 실험을 위해 일부러 만든 말이에요. 우리말샘·구글·네이버 어디에서도 쓰인 흔적이 없음을 확인했어요(2026년 10월, 연구 ' + f.study + ').'),
      srOnly('판정: 논문에서 만든 가짜 말, 확인된 뜻 없음')
    ];
    var facts = [];
    if (f.made) facts.push(h('p', null, ['만든 사람이 정한 뜻: ', h('b', { text: f.made }), h('span', { class: 'src', text: ' (AI에게는 알려 주지 않았어요)' })]));
    if (f.e !== null && f.e !== undefined) facts.push(h('p', null, ['세 AI에게 두 가지 질문으로 6번 물었더니 ', h('b', { text: f.e + '번' }), ' 실제 있는 말처럼 뜻을 단정했어요.']));
    if (typeName) facts.push(h('p', { class: 'src', text: '논문에서의 유형: ' + typeName }));
    if (facts.length) kids.push(h('div', { class: 'fact-box' }, facts));
    kids.push(questionBlock(display));
    kids.push(riskBlock(f.w));
    kids.push(actions(display, true));
    kids.push(paperDetail(f.w, display));
    return h('article', { class: 'entry s-bad' }, kids);
  }

  // 사전에 없는 말: 먼저 "확인 중" 카드를 보여 주고, 결과가 오면 바꾼다
  var lookupSeq = 0;
  function pendingCard(display) {
    return h('article', { class: 'entry s-wait', 'aria-busy': 'true' }, [
      verdict('확인\n중', 'wait', display, '이 앱 사전엔 아직 없어요. 우리말샘과 네이버 블로그·카페에서 실제로 쓰였는지 찾고 있어요…')
    ]);
  }

  function lookupCard(r, q, display) {
    var web = r.web, kids = [];
    if (r.state === 'dict') {
      kids.push(verdict('사전에\n있음', 'ok', display, '국립국어원 우리말샘에 실린 말이에요.'));
      kids.push(srOnly('판정: 우리말샘에 있는 말'));
      kids.push(h('ol', { class: 'senses' }, r.dict.senses.map(function (s) {
        var link = safeLink(s.link);
        return h('li', null, [
          s.pos ? h('span', { class: 'badge', text: s.pos }) : null, ' ', s.def, ' ',
          link ? h('a', { href: link, target: '_blank', rel: 'noopener', class: 'src-link', text: '우리말샘에서 보기' }) : null
        ]);
      })));
      if (web && web.count) kids.push(h('p', { class: 'src', text: '네이버 블로그·카페 글 ' + web.count + '건에서도 이 말이 쓰였어요.' }));
      kids.push(h('div', { class: 'meta' }, [h('span', { class: 'badge ok', text: '출처: 우리말샘' }), h('span', { class: 'badge', text: '확인일 ' + (r.checkedAt || '') })]));
      kids.push(actions(display, false));
      return h('article', { class: 'entry s-ok' }, kids);
    }
    if (r.state === 'used') {
      kids.push(verdict('실제로\n쓰여요', 'ok', display, '이 앱 사전' + (r.dictChecked ? '과 우리말샘' : '') + '에는 없지만, 네이버 블로그·카페 글 ' + web.count + '건에서 이 말이 그대로 쓰였어요.'));
      kids.push(srOnly('판정: 실제로 쓰이는 말'));
      kids.push(h('p', { class: 'note-honest' }, ['이 앱은 사전에 없는 뜻을 지어내지 않아요. ', h('b', { text: '아래 글에서 어떻게 쓰였는지' }), ' 보고 뜻을 확인해 보세요.']));
      kids.push(samplesBlock(web, display));
      kids.push(questionBlock(display, 'AI에게 뜻을 물어본다면'));
      kids.push(actions(display, true));
      return h('article', { class: 'entry s-ok' }, kids);
    }
    if (r.state === 'rare') {
      kids.push(verdict('드물게\n쓰여요', 'warn', display, '네이버 블로그·카페 글 ' + web.count + '건에서만 이 말을 찾았어요. 아주 새로 생겼거나 일부에서만 쓰는 말일 수 있어요.'));
      kids.push(srOnly('판정: 드물게 쓰이는 말'));
      kids.push(samplesBlock(web, display));
      kids.push(questionBlock(display));
      kids.push(riskBlock(q));
      kids.push(actions(display, true));
      kids.push(paperDetail(q, display));
      return h('article', { class: 'entry s-warn' }, kids);
    }
    if (r.state === 'none') {
      kids.push(verdict('쓰인 흔적\n없음', '', display, (r.dictChecked ? '우리말샘에도, ' : '') + '네이버 블로그·카페 글에서도 이 말을 찾지 못했어요. 아주 새로 생겼거나 실제로는 쓰이지 않는 말일 수 있어요.'));
      kids.push(srOnly('판정: 쓰인 흔적 없음'));
      kids.push(h('p', { class: 'note-honest' }, ['AI가 이 말의 뜻을 설명해도 ', h('b', { text: '지어낸 뜻일 수 있어요.' }), ' 아래 질문으로 먼저 있는지부터 물어보세요.']));
      kids.push(questionBlock(display));
      kids.push(riskBlock(q));
      kids.push(actions(display, true));
      kids.push(paperDetail(q, display));
      return h('article', { class: 'entry s-bad' }, kids);
    }
    // unknown: 인터넷 확인을 못 함 (파일로 열었거나, 연결이 끊겼거나, 키가 없음)
    kids.push(verdict('아직\n모름', 'wait', display, '이 앱 사전엔 아직 없는 말이에요. ' + (r.why || '지금은 실제로 쓰이는지 인터넷으로 확인하지 못했어요.')));
    kids.push(srOnly('판정: 확인하지 못함'));
    kids.push(questionBlock(display));
    kids.push(riskBlock(q));
    kids.push(actions(display, true));
    kids.push(paperDetail(q, display));
    return h('article', { class: 'entry s-wait' }, kids);
  }

  function runLookup(q, display, holder) {
    var seq = ++lookupSeq;
    function done(r) {
      if (seq !== lookupSeq) return; // 그사이 다른 말을 찾았으면 버림
      var card = lookupCard(r, q, display);
      holder.replaceWith(card);
    }
    if (location.protocol === 'file:' || !window.fetch) {
      done({ state: 'unknown', why: '파일로 바로 열어서 인터넷 확인 기능이 꺼져 있어요. 공개 주소에서 열면 실제 쓰임을 찾아 드려요.' });
      return;
    }
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 9000);
    fetch('api/lookup?w=' + encodeURIComponent(display), ctrl ? { signal: ctrl.signal } : {})
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (data) {
        var r = L.interpretLookup(data);
        r.checkedAt = data && data.checkedAt;
        if (r.state === 'unknown') r.why = '지금은 실제 쓰임 확인 서비스에 연결하지 못했어요. 잠시 뒤 다시 찾아 주세요.';
        done(r);
      })
      .catch(function () { done({ state: 'unknown', why: '인터넷 연결이 없거나 확인이 늦어져 실제 쓰임을 찾지 못했어요. 잠시 뒤 다시 찾아 주세요.' }); })
      .then(function () { clearTimeout(timer); });
  }

  function showHome(on) { $('home').hidden = !on; }

  function runFind(raw) {
    closeAc();
    lookupSeq++;
    var input = $('q');
    if (typeof raw === 'string') input.value = raw;
    var value = input.value;
    findOut.textContent = '';
    showHome(false);
    var res;
    try { res = L.search(value, WORDS); } catch (e) { res = { status: 'error' }; }
    switch (res.status) {
      case 'empty': findOut.appendChild(msg('찾을 말을 넣어 주세요. 예: 얼죽아')); setUrl({}); showHome(true); return;
      case 'invalid': findOut.appendChild(msg('한글이나 영어로 된 말을 넣어 주세요. 기호와 숫자만으로는 찾을 수 없어요.')); showHome(true); return;
      case 'toolong': findOut.appendChild(msg('말이 너무 길어요. ' + L.MAX_LEN + '글자 이하로 찾고 싶은 말만 넣어 주세요. AI 답 전체를 확인하려면 “AI 답 점검”을 써 주세요.')); showHome(true); return;
      case 'error': findOut.appendChild(msg('찾는 중에 문제가 생겼어요. 다시 한 번 눌러 주세요.')); showHome(true); return;
      case 'found': findOut.appendChild(entryCard(res.entry)); setUrl({ q: res.entry.w }); saveRecent(res.entry.w); break;
      case 'cho':
        if (!res.list.length) { findOut.appendChild(msg('“' + res.query + '” 초성으로 시작하는 말이 사전에 없어요.')); showHome(true); return; }
        findOut.appendChild(h('div', { class: 'entry' }, [
          h('h3', { text: '“' + res.query + '” 초성으로 찾은 말' }),
          h('div', { class: 'sugg' }, res.list.map(function (w) {
            return h('button', { class: 'chip', type: 'button', text: w.w, onclick: function () { runFind(w.w); } });
          }))
        ]));
        setUrl({ q: res.query });
        break;
      default:
        var word = L.extractWord(value).trim().replace(/\s+/g, ' ');
        if (/[<>{}\[\]=\\/|;$`]/.test(word)) { findOut.appendChild(msg('기호(< > / = 같은 것)는 빼고 찾고 싶은 낱말만 넣어 주세요.')); showHome(true); return; }
        word = word.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 ]/g, '').trim().slice(0, 20);
        if (!word) { findOut.appendChild(msg('한글이나 영어로 된 말을 넣어 주세요.')); showHome(true); return; }
        var q = res.query;
        if (res.suggestions && res.suggestions.length) {
          findOut.appendChild(h('div', { class: 'did' }, [
            h('span', { text: '혹시 이 말인가요?' }),
            h('div', { class: 'sugg' }, res.suggestions.map(function (w) {
              return h('button', { class: 'chip', type: 'button', text: w.w, onclick: function () { runFind(w.w); } });
            }))
          ]));
        }
        var fake = L.findFake(q, FAKES);
        if (fake) findOut.appendChild(fakeCard(fake, word));
        else {
          var holder = pendingCard(word);
          findOut.appendChild(holder);
          runLookup(q, word, holder);
        }
        setUrl({ q: word });
        saveRecent(word);
    }
    // 결과 아래에 처음 화면으로 돌아가는 길
    findOut.appendChild(h('p', { class: 'back' }, [h('button', { class: 'link', type: 'button', text: '다른 말 둘러보기', onclick: function () { lookupSeq++; input.value = ''; findOut.textContent = ''; showHome(true); setUrl({}); input.focus(); } })]));
  }

  $('find-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (acIndex >= 0 && acItems[acIndex]) runFind(acItems[acIndex].w); else runFind();
  });
  Array.prototype.forEach.call(document.querySelectorAll('.chip[data-q]'), function (b) {
    b.addEventListener('click', function () { runFind(b.getAttribute('data-q')); });
  });

  // ── 입력하는 동안 추천 ──
  var ac = $('ac'), qInput = $('q'), acItems = [], acIndex = -1;
  function closeAc() { ac.hidden = true; ac.textContent = ''; acItems = []; acIndex = -1; qInput.setAttribute('aria-expanded', 'false'); qInput.removeAttribute('aria-activedescendant'); }
  function paintAc() {
    Array.prototype.forEach.call(ac.children, function (li, i) { li.setAttribute('aria-selected', i === acIndex ? 'true' : 'false'); });
    if (acIndex >= 0) qInput.setAttribute('aria-activedescendant', 'ac-' + acIndex); else qInput.removeAttribute('aria-activedescendant');
  }
  qInput.addEventListener('input', function () {
    var list;
    try { list = L.suggest(qInput.value, WORDS, 6); } catch (e) { list = []; }
    ac.textContent = ''; acItems = list; acIndex = -1;
    if (!list.length) { closeAc(); return; }
    list.forEach(function (w, i) {
      ac.appendChild(h('li', { id: 'ac-' + i, role: 'option', 'aria-selected': 'false',
        onmousedown: function (e) { e.preventDefault(); runFind(w.w); } }, [
        h('b', { text: w.w }), h('span', { text: w.m })
      ]));
    });
    ac.hidden = false; qInput.setAttribute('aria-expanded', 'true');
  });
  qInput.addEventListener('keydown', function (e) {
    if (ac.hidden || !acItems.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); acIndex = (acIndex + 1) % acItems.length; paintAc(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); acIndex = acIndex <= 0 ? acItems.length - 1 : acIndex - 1; paintAc(); }
    else if (e.key === 'Escape') { closeAc(); }
  });
  qInput.addEventListener('blur', function () { setTimeout(closeAc, 150); });

  // ── 사전 둘러보기: 분류 + 20개씩 ──
  var CATS = ['전체'];
  WORDS.forEach(function (w) { if (w.cat && CATS.indexOf(w.cat) < 0) CATS.push(w.cat); });
  var curCat = '전체', shown = 20, PAGE = 20;
  function sortedWords() {
    return WORDS.filter(function (w) { return curCat === '전체' || w.cat === curCat; })
      .slice().sort(function (a, b) { return a.w.localeCompare(b.w, 'ko'); });
  }
  function renderBrowse() {
    var list = sortedWords(), box = $('browse-list');
    box.textContent = '';
    list.slice(0, shown).forEach(function (w) {
      box.appendChild(h('button', { class: 'chip' + (w.note ? ' caution-chip' : ''), type: 'button', title: w.m,
        'aria-label': w.note ? w.w + ' (' + w.note + ')' : null,
        onclick: function () { runFind(w.w); $('q').scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, [w.w]));
    });
    var rest = list.length - shown, more = $('browse-more');
    more.hidden = rest <= 0;
    more.textContent = '더 보기 (' + rest + '개 남음)';
  }
  $('browse-more').addEventListener('click', function () { shown += PAGE * 2; renderBrowse(); });
  CATS.forEach(function (c) {
    $('cats').appendChild(h('button', { class: 'cat', type: 'button', 'aria-pressed': c === curCat ? 'true' : 'false', text: c,
      onclick: function (e) {
        curCat = c; shown = PAGE;
        Array.prototype.forEach.call($('cats').children, function (b) { b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'); });
        renderBrowse();
      } }));
  });

  // ── 2. AI 답 점검 ──
  var checkOut = $('check-result');
  var VERDICT = {
    E: { seal: '단정', cls: '', box: 's-bad', title: '확인 없이 뜻을 단정했어요', body: '“추측”이나 “확실하지 않다” 같은 표시 없이 실제 있는 말처럼 뜻을 설명했어요. 논문에서 AI는 없는 말에도 이렇게 답한 경우가 많았어요. 출처가 없다면 믿기 전에 확인하세요.' },
    D: { seal: '추측', cls: 'warn', box: 's-warn', title: '추측이라고 밝히고 뜻을 만들었어요', body: '모른다는 표시는 했지만 그럴듯한 뜻을 함께 내놓았어요. 그 뜻은 AI가 글자를 풀어 짐작한 것일 수 있으니 실제 뜻으로 믿지 마세요.' },
    A: { seal: '모름', cls: 'ok', box: 's-ok', title: '모른다고 정직하게 답했어요', body: '없는 말이거나 널리 쓰이지 않는 말일 수 있어요. 어디서 본 말인지 다시 확인해 보세요.' },
    C: { seal: '되물음', cls: 'ok', box: 's-ok', title: '어디서 본 말인지 되물었어요', body: '뜻을 지어내지 않고 맥락을 물었어요. 그 말이 나온 문장을 함께 보여 주면 더 정확히 확인할 수 있어요.' },
    B: { seal: '다른 말', cls: 'warn', box: 's-warn', title: '다른 말(오타)로 보고 답했어요', body: 'AI가 비슷한 다른 말로 짐작했어요. 내가 찾는 말과 같은지 확인하세요.' },
    U: { seal: '조심', cls: 'warn', box: 's-warn', title: '분명하게 판단할 표시가 없어요', body: '“모른다”나 “추측”이라는 표시를 찾지 못했어요. 이럴 때는 단정한 답으로 보고, 출처가 없다면 믿기 전에 확인하세요.' }
  };
  var CLASS_OF = { DEF: 'def', D: 'hedge', A: 'honest', C: 'honest', B: 'honest' };

  function highlighted(text, hits) {
    var spans = [];
    Object.keys(CLASS_OF).forEach(function (k) { (hits[k] || []).forEach(function (s) { spans.push({ s: s.start, e: s.end, c: CLASS_OF[k] }); }); });
    spans.sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var out = h('div', { class: 'answer' }), pos = 0;
    spans.forEach(function (sp) {
      if (sp.s < pos) return;
      if (sp.s > pos) out.appendChild(document.createTextNode(text.slice(pos, sp.s)));
      out.appendChild(h('mark', { class: sp.c, text: text.slice(sp.s, sp.e) }));
      pos = sp.e;
    });
    if (pos < text.length) out.appendChild(document.createTextNode(text.slice(pos)));
    return out;
  }

  function scoreText() {
    if (!SCORE || !SCORE.n) return '';
    return '논문 응답 ' + SCORE.n + '건으로 채점해 보니, “뜻을 단정했는가” 판정이 연구자 분류와 ' + (SCORE.e * 100).toFixed(1) + '% 일치했어요(카파 ' + SCORE.kappa + ').';
  }

  function runCheck() {
    checkOut.textContent = '';
    var word = L.extractWord($('cw').value || '').trim();
    var r;
    try { r = L.checkAnswer($('ca').value, word); } catch (e) { r = { status: 'error' }; }
    if (r.status === 'empty') { checkOut.appendChild(msg('AI가 한 답을 붙여 넣어 주세요. “예시 답변으로 해 보기”로 먼저 해 볼 수도 있어요.')); return; }
    if (r.status === 'invalid') { checkOut.appendChild(msg('한글로 된 AI 답변을 붙여 넣어 주세요. 너무 짧으면 판단할 수 없어요.')); return; }
    if (r.status === 'error') { checkOut.appendChild(msg('확인하는 중에 문제가 생겼어요. 다시 한 번 눌러 주세요.')); return; }
    var v = VERDICT[r.code];
    var kids = [
      h('div', { class: 'verdict' }, [
        h('div', { class: 'seal stamp ' + v.cls, 'aria-hidden': 'true' }, [h('span', { text: v.seal })]),
        h('div', null, [h('h2', { class: 'head head-sm', text: v.title }), h('p', { class: 'sub', text: v.body })])
      ])
    ];
    if (r.reason === 'hedge-outnumbered') kids.push(h('p', { class: 'src', text: '“아마” 같은 추측 표현이 있지만, 뜻을 단정하는 문장이 더 많아요.' }));
    if (r.code === 'E' || r.code === 'U' || r.code === 'D') {
      kids.push(h('p', { class: 'src', text: r.hasSource ? '답변에 출처로 보이는 말이 있어요. 그 출처를 직접 열어 확인해 보세요.' : '답변에 사전이나 기사 같은 출처가 없어요.' }));
    }
    var wq = L.normalize(word);
    if (wq) {
      var s = L.search(word, WORDS), fake = L.findFake(wq, FAKES), cmp = null;
      if (s.status === 'found') cmp = h('div', { class: 'block' }, [h('h3', { text: '사전에서 찾은 “' + s.entry.w + '”' }), h('p', { text: s.entry.m }), h('p', { class: 'src', text: 'AI 답과 뜻이 같은지 비교해 보세요.' })]);
      else if (fake) {
        cmp = h('div', { class: 'block' }, [h('h3', { text: '“' + fake.w + '”은(는) 논문에서 만든 가짜 말이에요' }),
          h('p', { text: (r.code === 'E' || r.code === 'U') ? '없는 말인데 AI가 뜻을 단정했어요. 이 답의 뜻은 지어낸 것이에요.' : r.code === 'D' ? '없는 말이라, AI가 추측한 뜻도 실제 뜻이 아니에요.' : '없는 말이니, AI가 정직하게 답한 거예요.' })]);
      } else if (s.status === 'notfound') {
        cmp = h('div', { class: 'block' }, [h('h3', { text: '“' + word + '”은(는) 이 앱 사전에 없어요' }),
          h('p', { text: '실제로 쓰이는 말인지 확인해 보면 AI 답을 믿어도 될지 판단하기 쉬워요.' }),
          h('button', { class: 'ghost small', type: 'button', text: '실제 쓰임 확인하기', onclick: function () { selectTab('find'); runFind(word); } })]);
      }
      if (cmp) kids.push(cmp);
    }
    kids.push(h('details', { class: 'why' }, [
      h('summary', { text: '어떤 표현을 보고 판단했는지 보기' }),
      highlighted(r.text, r.hits),
      h('p', { class: 'legend' }, [
        h('span', null, [h('mark', { class: 'def', text: '뜻을 단정하는 표현' })]),
        h('span', null, [h('mark', { class: 'hedge', text: '추측 표시' })]),
        h('span', null, [h('mark', { class: 'honest', text: '모른다·되묻기·다른 말' })])
      ]),
      r.cut ? h('p', { class: 'src', text: '답변이 길어서 앞부분 4,000자만 확인했어요.' }) : null,
      h('p', { class: 'src', text: '논문의 응답 분류 기준(A 모른다고 함 · B 다른 말로 추정 · C 맥락 요청 · D 쪼개서 추측 · E 실제 있는 말처럼 단정)을 표현 규칙으로 옮겨 자동으로 판단해요. 사람이 읽는 것만큼 정확하지는 않아서, 애매하면 조심하라고 안내해요.' }),
      scoreText() ? h('p', { class: 'src', text: scoreText() }) : null
    ]));
    checkOut.appendChild(h('article', { class: 'entry ' + v.box }, kids));
  }
  $('check-form').addEventListener('submit', function (e) { e.preventDefault(); runCheck(); });
  $('sample-answer').addEventListener('click', function () {
    $('cw').value = '퇴노듣';
    $('ca').value = '‘퇴노듣’은 ‘퇴근길 노래 듣기’를 줄인 말이야. 하루 일과를 마치고 집에 가는 길에 좋아하는 노래를 들으며 쉬는 시간을 말해. 요즘 직장인들이 SNS에서 많이 쓰는 표현이야.';
    runCheck();
  });
  if (scoreText()) { $('score-note').textContent = scoreText(); $('score-note').hidden = false; }

  // ── 3. 진짜? 가짜? 퀴즈: 논문의 가짜 말(연구 1)과 실제 신조어(대조군)를 섞어 맞힌다 ──
  var quizBox = $('quiz'), quizStarted = false, QN = 10;
  var quiz = null;
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function renderQuizIntro() {
    quizBox.textContent = '';
    quizBox.appendChild(h('div', { class: 'quiz-intro' }, [
      h('h2', { class: 'sec-h', text: '진짜 쓰이는 말일까, 지어낸 말일까?' }),
      h('p', { text: '논문에서 일부러 만든 가짜 말과 실제 신조어를 섞었어요. 생김새만 보고 맞혀 보세요. 수업이나 가족과 함께 하기 좋아요.' }),
      h('p', { class: 'src', text: '10문제 · 기록은 남지 않아요' }),
      h('button', { class: 'primary', type: 'button', text: '시작하기', onclick: startQuiz })
    ]));
  }
  function startQuiz() {
    quizStarted = true;
    var fakes = shuffle(FAKES.filter(function (f) { return f.study === 1; })).slice(0, QN / 2).map(function (f) { return { w: f.w, real: false, fake: f }; });
    var reals = shuffle(WORDS.filter(function (w) { return w.src === 'paper'; })).slice(0, QN / 2).map(function (w) { return { w: w.w, real: true, entry: w }; });
    quiz = { items: shuffle(fakes.concat(reals)), i: 0, right: 0, fooled: 0 };
    if (!quiz.items.length) { quizBox.textContent = ''; quizBox.appendChild(msg('퀴즈 자료를 불러오지 못했어요.')); return; }
    renderQuestion();
  }
  function renderQuestion() {
    var it = quiz.items[quiz.i];
    quizBox.textContent = '';
    var card = h('div', { class: 'entry quiz-card' }, [
      h('p', { class: 'src', text: (quiz.i + 1) + ' / ' + quiz.items.length + ' · 맞힌 수 ' + quiz.right }),
      h('p', { class: 'quiz-word', text: it.w }),
      h('div', { class: 'quiz-btns' }, [
        h('button', { class: 'primary', type: 'button', text: '진짜 쓰이는 말', onclick: function () { answer(true); } }),
        h('button', { class: 'ghost', type: 'button', text: '지어낸 말', onclick: function () { answer(false); } })
      ]),
      h('div', { id: 'quiz-fb', 'aria-live': 'polite' })
    ]);
    quizBox.appendChild(card);
  }
  function answer(sayReal) {
    var it = quiz.items[quiz.i], good = sayReal === it.real;
    if (good) quiz.right++;
    if (!it.real && sayReal) quiz.fooled++;
    Array.prototype.forEach.call(quizBox.querySelectorAll('.quiz-btns button'), function (b) { b.disabled = true; });
    var fb = $('quiz-fb');
    var lines = [h('p', { class: 'quiz-res ' + (good ? 'good' : 'bad'), text: good ? '맞았어요!' : '아쉬워요!' })];
    if (it.real) {
      lines.push(h('p', null, [h('b', { text: '진짜 쓰이는 말' }), ' · ' + (it.entry.full ? it.entry.full + ' — ' : '') + it.entry.m]));
    } else {
      var f = it.fake;
      lines.push(h('p', null, [h('b', { text: '논문에서 만든 가짜 말' }), f.made ? ' · 만든 뜻: ' + f.made : '']));
      if (f.e !== null && f.e !== undefined) lines.push(h('p', { class: 'src', text: 'AI 세 곳에 6번 물었더니 ' + f.e + '번 실제 있는 말처럼 뜻을 단정했어요.' }));
    }
    var last = quiz.i >= quiz.items.length - 1;
    lines.push(h('button', { class: 'ghost', type: 'button', text: last ? '결과 보기' : '다음 문제', onclick: function () { if (last) quizEnd(); else { quiz.i++; renderQuestion(); } } }));
    lines.forEach(function (x) { fb.appendChild(x); });
    var nextBtn = fb.querySelector('button'); if (nextBtn) nextBtn.focus();
  }
  function quizEnd() {
    quizBox.textContent = '';
    quizBox.appendChild(h('div', { class: 'entry quiz-card' }, [
      h('p', { class: 'quiz-word', text: quiz.right + ' / ' + quiz.items.length }),
      h('p', null, quiz.fooled ? ['가짜 말 ' + quiz.fooled + '개를 진짜로 골랐어요. 사람도 줄임말처럼 생기면 쉽게 속아요. AI도 마찬가지였어요(가짜 줄임말에 “무슨 뜻이야?”로 물으면 ' + pctText(HL.premise) + '가 뜻을 단정).'] : ['가짜 말을 모두 알아봤어요! 그래도 AI는 줄임말처럼 생긴 가짜 말에 “무슨 뜻이야?”로 물으면 ' + pctText(HL.premise) + '가 뜻을 단정했어요.']),
      h('p', null, [h('b', { text: '모르는 말은 “무슨 뜻이야?”보다 “실제로 있어?”를 먼저 물어보세요.' })]),
      h('div', { class: 'row' }, [
        h('button', { class: 'primary', type: 'button', text: '다시 하기', onclick: startQuiz }),
        h('button', { class: 'ghost', type: 'button', text: '말 찾기로 가기', onclick: function () { selectTab('find', true); } })
      ])
    ]));
  }

  // ── 소개 칸: 숫자를 한곳(Logic.PAPER)에서 가져와 화면마다 같게 ──
  $('f-premise').textContent = pctText(HL.premise);
  $('f-confirm').textContent = pctText(HL.confirm);
  $('f-abbr').textContent = pctText(HL.abbr);
  $('f-random').textContent = (HL.random.e / HL.random.n * 100).toFixed(1) + '%';
  $('f-models').textContent = '줄임말처럼 생긴 가짜 말을 단정한 비율은 ' + P.abbr.models.map(function (m) { return m.name + ' ' + L.pct(m) + '%'; }).join(', ') + '였어요(각 회사 API로 물은 결과라 채팅 앱과는 다를 수 있어요).';
  $('f-basis').textContent = '모든 수치: ' + HL.basis + ', 연구자 분류 기준. 가짜 줄임말 30개·낯선 글자 말 30개, 각 180건.';
  // 휴대폰에서는 소개를 접어 두어 결과 아래가 길어지지 않게
  try { if (window.matchMedia('(max-width: 1023px)').matches) $('about-d').removeAttribute('open'); } catch (e) { /* 무시 */ }
  if (CONFIG.reportUrl && safeLink(CONFIG.reportUrl)) { $('report-link').href = CONFIG.reportUrl; $('report-link').hidden = false; }

  // ── 홈 화면에 추가: 기기별 그림 안내 ──
  var ICON = {
    share: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
    add: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
    menu: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };
  function step(n, icon, text) {
    return h('li', null, [h('span', { class: 'n', text: String(n) }), h('span', { class: 'ico', 'aria-hidden': 'true', html: icon }), h('span', { text: text })]);
  }
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
  $('install').addEventListener('click', function () {
    if (deferred) { deferred.prompt(); deferred = null; return; }
    var help = $('install-help'), btn = $('install');
    if (!help.hidden) { help.hidden = true; btn.setAttribute('aria-expanded', 'false'); return; }
    help.textContent = '';
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) {
      help.appendChild(h('p', { class: 'ih', text: '아이폰·아이패드 (사파리)' }));
      help.appendChild(h('ol', { class: 'steps' }, [
        step(1, ICON.share, '화면 아래쪽 가운데 공유 버튼을 눌러요.'),
        step(2, ICON.add, '목록을 조금 올려 “홈 화면에 추가”를 눌러요.'),
        step(3, ICON.check, '오른쪽 위 “추가”를 누르면 홈 화면에 아이콘이 생겨요.')
      ]));
      help.appendChild(h('p', { class: 'src', text: '카카오톡 안에서 열었다면, 오른쪽 아래 메뉴에서 “사파리로 열기”를 먼저 눌러 주세요.' }));
    } else {
      help.appendChild(h('p', { class: 'ih', text: '안드로이드 휴대폰·PC (크롬)' }));
      help.appendChild(h('ol', { class: 'steps' }, [
        step(1, ICON.menu, '오른쪽 위 점 세 개 메뉴를 눌러요.'),
        step(2, ICON.add, '“홈 화면에 추가” 또는 “앱 설치”를 눌러요.'),
        step(3, ICON.check, '“추가” 또는 “설치”를 누르면 아이콘이 생겨요.')
      ]));
    }
    help.hidden = false; btn.setAttribute('aria-expanded', 'true');
  });

  // ── 시작 ──
  $('dict-date').textContent = window.DICT_DATE || '';
  $('dict-count').textContent = String(WORDS.length);
  renderRecent();
  renderBrowse();
  try {
    var q0 = new URLSearchParams(location.search).get('q');
    if (q0) runFind(q0.slice(0, 200));
  } catch (e) { /* 무시 */ }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
