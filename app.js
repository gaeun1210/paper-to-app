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
    else openShareBox(url, title);
  }
  // 기기 공유 창이 없는 브라우저(카카오톡 안 브라우저 등): 보낼 링크와 미리보기 모습을 보여 주고 복사하게 한다
  function openShareBox(url, title) {
    var old = $('share-box'); if (old) old.remove();
    var input = h('input', { type: 'text', readonly: '', class: 'share-url', 'aria-label': '공유할 링크' });
    var shown = url; try { shown = decodeURI(url); } catch (e) { /* 그대로 */ }
    input.value = shown;
    var close = function () { if (d.open && d.close) d.close(); d.remove(); };
    var d = h('dialog', { id: 'share-box', class: 'modal share-modal', 'aria-labelledby': 'share-h' }, [
      h('h3', { id: 'share-h', text: '이 결과 공유하기' }),
      h('div', { class: 'share-prev', 'aria-hidden': 'true' }, [
        h('img', { src: 'og.png', alt: '', width: '1200', height: '630' }),
        h('div', { class: 'sp-t' }, [h('b', { text: '신조어 팩트체크 · 이 신조어, 진짜야?' }), h('span', { text: 'paper-to-app.vercel.app' })])
      ]),
      input,
      h('p', { class: 'src', text: '링크를 복사해 카카오톡 같은 대화창에 붙여 넣으면, 위와 같은 미리보기 그림이 함께 보여요. 받은 사람이 링크를 열면 “' + (title || '').replace(/ · 신조어 팩트체크$/, '') + '” 결과가 바로 열려요.' }),
      h('div', { class: 'row modal-actions' }, [
        h('button', { class: 'ghost', type: 'button', text: '닫기', onclick: close }),
        h('button', { class: 'primary', type: 'button', text: '링크 복사', onclick: function () { copy(url, '링크를 복사했어요. 대화창에 붙여 넣어 보내세요'); close(); } })
      ])
    ]);
    d.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    document.body.appendChild(d);
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    input.addEventListener('focus', function () { input.select(); });
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

  // ── 최근 찾은 말 (이 기기에만 저장. 저장이 막힌 브라우저에서는 그 사실을 알린다) ──
  var RKEY = 'jinjja.recent.v1', saveWarned = false;
  var CLOCK_SVG = '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
  function loadRecent() {
    try { var a = JSON.parse(localStorage.getItem(RKEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }).slice(0, 8) : []; }
    catch (e) { return []; }
  }
  function saveRecent(word) {
    if (!word) return;
    var list = loadRecent().filter(function (x) { return x !== word; });
    list.unshift(word);
    var ok = true;
    try { localStorage.setItem(RKEY, JSON.stringify(list.slice(0, 8))); ok = localStorage.getItem(RKEY) !== null; } catch (e) { ok = false; }
    $('recent-fail').hidden = ok; // 저장 실패를 숨기지 않는다 (요구서 8)
    if (!ok && !saveWarned) { saveWarned = true; toast('이 브라우저에서는 최근 찾은 말이 저장되지 않아요'); }
    renderRecent();
  }
  function renderRecent() {
    var list = loadRecent(), box = $('recent-list');
    box.textContent = '';
    list.forEach(function (w) { box.appendChild(h('button', { class: 'chip chip-ico', type: 'button', onclick: function () { runFind(w); } }, [h('span', { class: 'ci', 'aria-hidden': 'true', html: CLOCK_SVG }), h('span', { text: w })])); });
    $('recent-empty').hidden = list.length > 0;
    $('recent').classList.toggle('is-empty', list.length === 0);
    $('recent-clear').hidden = list.length === 0;
    if (!list.length) hideRecentConfirm(false);
  }
  // 삭제 확인 모달: <dialog> 로 열어 포커스를 가두고 Esc 로 닫는다. 지원하지 않는 브라우저는 open 속성으로 대신 연다.
  var dlg = $('recent-confirm');
  function hideRecentConfirm(focusBack) {
    if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
    $('recent-clear').setAttribute('aria-expanded', 'false');
    if (focusBack) $('recent-clear').focus();
  }
  // 전체 삭제는 한 번 더 묻는다 (요구서 5-2)
  $('recent-clear').addEventListener('click', function () {
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    $('recent-clear').setAttribute('aria-expanded', 'true');
    $('recent-confirm-no').focus(); // 실수로 지우지 않게 취소에 먼저 포커스
  });
  $('recent-confirm-no').addEventListener('click', function () { hideRecentConfirm(true); });
  dlg.addEventListener('cancel', function (e) { e.preventDefault(); hideRecentConfirm(true); }); // Esc
  dlg.addEventListener('click', function (e) { if (e.target === dlg) hideRecentConfirm(true); }); // 바깥 누르면 닫기
  $('recent-confirm-yes').addEventListener('click', function () {
    var ok = true;
    try { localStorage.removeItem(RKEY); ok = localStorage.getItem(RKEY) === null; } catch (e) { ok = false; }
    hideRecentConfirm(false);
    renderRecent();
    toast(ok ? '이 기기의 최근 찾은 말을 모두 지웠어요' : '지우지 못했어요. 브라우저 설정을 확인해 주세요.');
    $('q').focus();
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
    try { document.body.setAttribute('data-tab', which); } catch (e) { /* 무시 */ }
    if (which === 'quiz' && !quizStarted) renderQuizIntro();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () {
      var k = t.id.replace('tab-', '');
      selectTab(k);
      markNav(k === 'find' ? 'find' : k);
      if (k === 'find') { $('q').focus({ preventScroll: true }); $('top').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
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
      var links = L.aiLinks(sq.step1);
      box.appendChild(h('div', { class: 'open-row' }, [h('span', { class: 'open-l', text: '이 질문으로 바로 열기' })].concat(links.map(function (a) {
        return h('a', { class: 'open-ai', href: a.url, target: '_blank', rel: 'noopener', text: a.name + ' ↗',
          title: a.copy ? '질문을 복사하고 ' + a.name + '를 열어요. 입력 칸에 붙여 넣어 보내세요.' : null,
          onclick: a.copy ? function () { copy(sq.step1, '질문을 복사했어요. ' + a.name + ' 입력 칸에 붙여 넣어 보내세요'); } : null });
      })).concat(links.some(function (a) { return a.copy; }) ? [h('span', { class: 'open-note', text: 'Gemini는 질문이 복사된 채로 열려요. 입력 칸에 붙여 넣기 한 번이 더 필요해요.' })] : [])));
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

  // 쓰인 흔적이 없거나 드문 말: 받은 AI 답을 바로 점검하러 가는 눈에 띄는 버튼 (논문: 없는 말에도 AI가 뜻을 지어냄)
  function goCheckWith(word) {
    $('cw').value = word; updateCheckUi();
    selectTab('check'); markNav('check');
    try { history.replaceState(null, '', location.pathname + location.search + '#check'); } catch (e) { /* 무시 */ }
    $('main').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('ca').focus({ preventScroll: true });
  }
  function checkCta(word, fake) {
    return h('div', { class: 'check-cta' }, [
      h('p', { class: 'cta-h', text: fake ? 'AI에게 물어봤다면, 받은 답을 점검해 보세요 — 뜻을 설명했다면 그건 지어낸 뜻이에요' : 'AI에게 물어봤다면, 받은 답을 점검해 보세요' }),
      h('p', { text: '논문에서 AI는 없는 신조어에도 뜻을 지어냈어요. 받은 답을 붙여 넣으면, 확인 없이 뜻을 단정했는지와 이 말이 실제로 쓰이는지를 함께 알려 드려요.' }),
      h('button', { class: 'primary', type: 'button', text: '받은 AI 답 점검하기', onclick: function () { goCheckWith(word); } })
    ]);
  }

  function paperDetail() {
    return h('p', { class: 'paper-more' }, [h('a', { href: 'paper.html#results', text: '이 수치의 근거 보기 (논문 이야기) →' })]);
  }

  function bar(label, o, safe) {
    var p = L.pct(o);
    return h('div', { class: 'bar' + (safe ? ' safe' : '') }, [
      h('span', { class: 'ask', text: label }),
      h('div', { class: 'track', role: 'img', 'aria-label': label + ' ' + p + '퍼센트' }, [h('div', { class: 'fill', style: 'width:' + Math.max(p, 1) + '%' })]),
      h('span', { class: 'num' }, [h('b', { text: p + '%' }), '가 뜻을 단정 (' + o.e + '/' + o.n + '건)'])
    ]);
  }

  // ── 결과 상태 문구 (요구서 3-1): 도장 색깔 말고도 글자로 상태를 알린다 ──
  var STATUS = {
    dict: { tag: '사전 등재 확인', text: '사전에서 확인된 단어입니다.', cls: 'ok' },
    app: { tag: '앱 사전', text: '이 앱 사전에 정리된 단어입니다.', cls: 'neutral' },
    used: { tag: '사용 흔적 발견', text: '온라인에서 사용된 흔적을 발견했습니다.', cls: 'ok' },
    more: { tag: '추가 확인 필요', text: '검색 결과가 충분하지 않아 추가 확인이 필요합니다.', cls: 'warn' },
    none: { tag: '확인된 흔적 없음', text: '현재 확인한 자료에서는 사용 흔적을 찾지 못했습니다.', cls: 'bad' },
    fail: { tag: '검색 실패', text: '자료를 확인하지 못했습니다. 결과가 없다는 뜻이 아니에요.', cls: 'wait' },
    off: { tag: '확인 기능 꺼짐', text: '온라인 확인 기능이 켜져 있지 않아 사용 흔적을 확인하지 못했습니다.', cls: 'wait' },
    fake: { tag: '논문 실험용 단어', text: '논문 실험을 위해 일부러 만든 단어입니다.', cls: 'bad' },
    loading: { tag: '확인 중', text: '사전과 온라인 자료를 확인하고 있어요…', cls: 'wait' }
  };
  function statusLine(key, extra) {
    var s = STATUS[key];
    return h('p', { class: 'status st-' + s.cls }, [h('span', { class: 'status-tag', text: s.tag }), ' ', s.text, extra ? h('span', { class: 'status-extra', text: ' ' + extra }) : null]);
  }

  // ── 확인 근거 (요구서 3-2): 서버가 실제로 돌려준 것만 적는다 ──
  var REASON = { timeout: '응답 시간 초과', network: '연결 실패', 'bad-json': '응답 형식 오류' };
  function reasonText(r) {
    if (!r) return '';
    if (REASON[r]) return REASON[r];
    if (/^http-\d+/.test(r)) return '서버 응답 오류(' + r.slice(5) + ')';
    if (/^api-/.test(r)) return '사전 서비스 오류';
    return '알 수 없는 오류';
  }
  var SCOPE = '네이버 블로그·카페를 따옴표로 검색해 관련도 순 각각 최대 100건의 제목·요약만 살펴봐요. 글 본문 전체, 다른 SNS·커뮤니티는 보지 않아요. 같은 말은 하루 동안 저장해 둔 결과를 보여 줄 수 있어요.';

  // 서버 결과(data)로 근거 줄을 만든다: [{label, text, links:[{url,text}]}]
  function serverEvidence(data) {
    var d = (data && data.dict) || {}, w = (data && data.web) || {}, rows = [];
    var dt;
    if (d.status === 'ok') dt = d.found ? '국립국어원 우리말샘에 있음 (뜻풀이 ' + d.senses.length + '개)' : '국립국어원 우리말샘에서 찾지 못함';
    else if (d.status === 'error') dt = '우리말샘 확인 실패 · ' + reasonText(d.reason);
    else dt = '확인하지 않음 (우리말샘 확인 기능 꺼짐)';
    var dl = (d.status === 'ok' && d.found) ? d.senses.map(function (s) { return safeLink(s.link); }).filter(Boolean).slice(0, 1).map(function (u) { return { url: u, text: '우리말샘 원문' }; }) : [];
    rows.push({ label: '사전 확인', text: dt, links: dl });
    var wt;
    if (w.status === 'ok') wt = '네이버 블로그·카페 검색 결과 ' + w.checked + '건을 살펴 ' + w.count + '건에서 이 말이 그대로 쓰임' + (w.partial ? ' · 블로그와 카페 중 한쪽은 확인하지 못함' : '');
    else if (w.status === 'error') wt = '온라인 확인 실패 · ' + reasonText(w.reason);
    else wt = '확인하지 않음 (온라인 확인 기능 꺼짐)';
    // 자료 제목을 링크 글자로 쓴다 (서버가 돌려준 제목·주소만)
    var wl = (w.status === 'ok' && w.samples) ? w.samples.filter(function (s) { return safeLink(s.link); }).map(function (s, i) {
      var t = (s.title || '').trim(); return { url: s.link, text: (s.kind ? s.kind + ' · ' : '') + (t ? (t.length > 28 ? t.slice(0, 28) + '…' : t) : '쓰인 글 ' + (i + 1)) };
    }) : [];
    rows.push({ label: '온라인 사례', text: wt, links: wl });
    var src = [];
    if (d.status === 'ok' || d.status === 'error') src.push('국립국어원 우리말샘 오픈 API');
    if (w.status === 'ok' || w.status === 'error') src.push('네이버 검색 API(블로그·카페)');
    rows.push({ label: '출처', text: src.length ? src.join(', ') : '확인한 출처 없음', links: [] });
    rows.push({ label: '확인일', text: (data && data.checkedAt) ? data.checkedAt : '알 수 없음', links: [] });
    rows.push({ label: '범위와 한계', text: SCOPE, links: [] });
    return rows;
  }
  function localEvidence(w) {
    return [
      { label: '사전 확인', text: w.src === 'paper' ? '국립국어원 우리말샘 등재 확인 (논문 대조군, 2026년 10월 연구자 확인)' : '이 앱 제작자가 정리한 뜻 (국립국어원 사전 등재는 이 화면에서 따로 확인하지 않음)', links: [] },
      { label: '온라인 사례', text: '아직 확인하지 않음 · 아래 “온라인 근거 확인하기”로 확인할 수 있어요', links: [] },
      { label: '출처', text: '이 앱 사전' + (w.src === 'paper' ? ', 논문 부록 D(대조군 목록)' : ''), links: [] },
      { label: '확인일', text: '사전 기준일 ' + (window.DICT_DATE || ''), links: [] }
    ];
  }
  function fakeEvidence(f) {
    return [
      { label: '사전 확인', text: '국립국어원 우리말샘에 없음 (논문 실험 전 연구자 확인)', links: [] },
      { label: '온라인 사례', text: '구글·네이버 따옴표 검색에서 쓰인 흔적 없음 (같은 시기 확인)', links: [] },
      { label: '출처', text: '논문 부록 D·E (연구 ' + f.study + '의 단어 목록과 검증 기록)', links: [] },
      { label: '확인일', text: f.study === 1 ? '2026년 10월 28일' : '2026년 10월 28~29일', links: [] },
      { label: '범위와 한계', text: '그 뒤에 누군가 새로 쓰기 시작했을 수 있어요. “온라인 근거 확인하기”로 지금 다시 확인할 수 있어요.', links: [] }
    ];
  }
  function evidenceBlock(rows, extra) {
    return h('div', { class: 'evidence' }, [
      h('h3', { text: '확인 근거' }),
      h('dl', null, rows.map(function (r) {
        return h('div', null, [h('dt', { text: r.label }), h('dd', null, [r.text].concat(r.links.length ? [h('span', { class: 'ev-links' }, r.links.map(function (l) {
          return h('a', { href: l.url, target: '_blank', rel: 'noopener', text: l.text + ' ↗' });
        }))] : []))]);
      }))
    ].concat(extra || []));
  }
  function evidenceText(rows) { return rows.map(function (r) { return '- ' + r.label + ': ' + r.text + (r.links.length ? ' (' + r.links.map(function (l) { return l.url; }).join(', ') + ')' : ''); }).join('\n'); }

  // 결과 복사용 글
  function shareUrl(word) {
    var base = location.protocol === 'file:' ? '' : location.origin + location.pathname;
    return base ? base + '?q=' + encodeURIComponent(word) : '';
  }
  function copyText(word, statusKey, lines, rows) {
    var s = STATUS[statusKey];
    return ['[신조어 팩트체크] “' + word + '” 확인 결과', '상태: ' + s.tag + ' — ' + s.text]
      .concat(lines || [])
      .concat(rows && rows.length ? ['확인 근거', evidenceText(rows)] : [])
      .concat(shareUrl(word) ? ['결과 다시 보기: ' + shareUrl(word)] : [])
      .join('\n');
  }

  // ── 결과 활용 (요구서 3-3): 복사 · 다시 검색 · 지우기 · 출처 바로가기 + 기존 공유·답 점검 ──
  function clearFind() {
    lookupSeq++;
    var input = $('q');
    input.value = ''; findOut.textContent = ''; showHome(true); setUrl({}); input.focus();
  }
  function actions(display, withCheck, opts) {
    opts = opts || {};
    var first = (opts.links || []).filter(Boolean)[0];
    return h('div', { class: 'actions' }, [
      opts.copy ? h('button', { class: 'act', type: 'button', text: '결과 복사', onclick: function () { copy(opts.copy(), '검색 결과와 근거를 복사했어요'); } }) : null,
      h('button', { class: 'act', type: 'button', text: '다시 검색', onclick: function () { runFind(display); } }),
      h('button', { class: 'act', type: 'button', text: '결과 지우기', onclick: clearFind }),
      first ? h('a', { class: 'act', href: first, target: '_blank', rel: 'noopener', text: '출처 바로가기 ↗' }) : null,
      withCheck ? h('button', { class: 'link', type: 'button', text: '받은 AI 답 점검하기', onclick: function () { $('cw').value = display; updateCheckUi(); selectTab('check', true); $('ca').focus(); } }) : null,
      h('button', { class: 'link', type: 'button', text: '이 결과 공유하기', onclick: function () { shareLink({ q: display }, display + ' · 신조어 팩트체크'); } }),
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
          s.title ? h('p', { class: 'stitle' }, marked(s.title, word)) : null,
          h('p', { class: 'stext' }, marked(s.text || s.title || '', word)),
          h('p', { class: 'smeta' }, [s.kind + (s.date ? ' · ' + s.date : '') + ' · ', link ? h('a', { href: link, target: '_blank', rel: 'noopener', text: '원문 보기' }) : '원문 주소 없음'])
        ]);
      })),
      h('p', { class: 'src', text: '같은 글자라도 사람 이름·가게 이름처럼 다른 뜻일 수 있어요. 글을 열어 직접 확인해 보세요.' })
    ]);
  }

  // ── 1. 말 찾기 ──
  var findOut = $('find-result');
  // 검색 결과가 있으면 결과 안내 띠를 숨긴다
  function markResult() { document.body.classList.toggle('has-result', !!(findOut && findOut.firstChild)); }
  if (window.MutationObserver && findOut) new MutationObserver(markResult).observe(findOut, { childList: true });
  var CAUTION = {
    '속된 말': '점잖지 않은 말이에요. 친한 사이에서 장난으로 쓰지만, 어른께나 공적인 자리에서는 피하는 게 좋아요.',
    '놀리는 말': '상대를 놀릴 때 쓰는 말이에요. 듣는 사람이 기분 나쁠 수 있어요.',
    '낮잡는 말': '어떤 사람들을 낮잡아 부르는 말이에요. 듣는 사람에게 상처가 될 수 있어요.',
    '무례한 말': '상대를 무시하는 느낌을 주는 말이에요. 듣는 사람이 기분 나쁠 수 있어요.'
  };

  // 서버에 실제 쓰임을 묻는다. cb({ data, r }) — r 은 Logic.interpretLookup 결과 + 실패 구분
  var lookupSeq = 0;
  function fetchLookup(word, cb) {
    if (location.protocol === 'file:' || !window.fetch) { cb({ data: null, r: { state: 'unknown', kind: 'offline' } }); return; }
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 9000);
    fetch('api/lookup?w=' + encodeURIComponent(word), ctrl ? { signal: ctrl.signal } : {})
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (data) {
        var r = L.interpretLookup(data);
        r.checkedAt = data && data.checkedAt;
        if (r.state === 'unknown') r.kind = r.off ? 'off' : r.webOff ? 'webOff' : 'error';
        cb({ data: data, r: r });
      })
      .catch(function () { cb({ data: null, r: { state: 'unknown', kind: 'network' } }); })
      .then(function () { clearTimeout(timer); });
  }

  // 사전 카드 아래 "온라인 근거 확인하기": 서버 결과로 근거를 바꿔 끼운다 (사전 뜻은 그대로)
  function liveCheckButton(word, slot, onRows) {
    if (location.protocol === 'file:') return h('p', { class: 'src', text: '파일로 바로 열어서 온라인 근거 확인은 꺼져 있어요.' });
    var btn = h('button', { class: 'ghost small', type: 'button', text: '온라인 근거 확인하기', onclick: function () {
      btn.disabled = true; btn.textContent = '확인 중…';
      fetchLookup(word, function (o) {
        var rows = o.data ? serverEvidence(o.data) : [{ label: '온라인 확인', text: o.r.kind === 'offline' ? '파일로 열어서 확인할 수 없어요' : '확인하지 못했어요 (' + (o.r.kind === 'network' ? '연결 실패' : '서비스 오류') + '). 결과가 없다는 뜻이 아니에요.', links: [] }];
        var extra = [];
        if (o.data && o.data.web && o.data.web.samples && o.data.web.samples.length) extra.push(samplesBlock(o.data.web, word));
        if (!o.data) extra.push(h('button', { class: 'ghost small', type: 'button', text: '다시 시도', onclick: function () { slot.replaceWith(liveSlot(word, onRows)); } }));
        var nb = evidenceBlock(rows, extra);
        slot.replaceWith(nb);
        if (onRows) onRows(rows);
      });
    } });
    return btn;
  }
  function liveSlot(word, onRows) {
    var slot = h('div', { class: 'live-slot' });
    slot.appendChild(liveCheckButton(word, slot, onRows));
    return slot;
  }

  function entryCard(w) {
    var paper = w.src === 'paper';
    var badges = [h('span', { class: 'badge ok', text: paper ? '우리말샘 등재 확인' : '이 앱 사전' })];
    if (w.cat) badges.push(h('span', { class: 'badge', text: w.cat }));
    badges.push(h('span', { class: 'badge', text: '기준일 ' + window.DICT_DATE }));
    var rows = localEvidence(w), statusKey = paper ? 'dict' : 'app';
    var ev = evidenceBlock(rows, [liveSlot(w.w, function (nr) { rows = nr; })]);
    return h('article', { class: 'entry s-ok' }, [
      verdict(paper ? '확인된\n뜻 있음' : '앱 사전에\n있음', paper ? 'ok' : 'neutral', w.w, w.full),
      statusLine(statusKey, paper ? '' : '국립국어원 사전 등재 여부는 아래 “온라인 근거 확인하기”로 확인할 수 있어요.'),
      w.note ? h('div', { class: 'caution', role: 'note' }, [
        h('span', { class: 'caution-icon', 'aria-hidden': 'true', text: '!' }),
        h('p', null, [h('b', { class: 'cb', text: w.note }), CAUTION[w.note] || '쓸 때 주의가 필요한 말이에요.'])
      ]) : null,
      h('p', { class: 'mean', text: w.m }),
      w.e ? h('p', { class: 'ex', text: w.e }) : null,
      h('div', { class: 'meta' }, badges),
      ev,
      actions(w.w, false, { copy: function () { return copyText(w.w, statusKey, ['뜻: ' + w.m + (w.full ? ' (' + w.full + ')' : '')].concat(w.note ? ['주의: ' + w.note] : []), rows); } })
    ]);
  }

  // 논문에서 일부러 만든 가짜 말
  function fakeCard(f, display) {
    var typeName = P[f.type] ? P[f.type].label : '';
    var rows = fakeEvidence(f);
    var kids = [
      verdict('논문의\n가짜 말', '', display, '논문 실험을 위해 일부러 만든 말이에요. 우리말샘·구글·네이버 어디에서도 쓰인 흔적이 없음을 확인했어요(2026년 10월, 연구 ' + f.study + ').'),
      statusLine('fake', '2026년 10월 확인 기준이에요.')
    ];
    var facts = [], lines = [];
    if (f.made) { facts.push(h('p', null, ['만든 사람이 정한 뜻: ', h('b', { text: f.made }), h('span', { class: 'src', text: ' (AI에게는 알려 주지 않았어요)' })])); lines.push('만든 뜻: ' + f.made + ' (AI에게는 알려 주지 않음)'); }
    if (f.e !== null && f.e !== undefined) { facts.push(h('p', null, ['세 AI에게 두 가지 질문으로 6번 물었더니 ', h('b', { text: f.e + '번' }), ' 실제 있는 말처럼 뜻을 단정했어요.'])); lines.push('논문 결과: 세 AI·두 질문 6건 중 ' + f.e + '건 뜻을 단정'); }
    if (typeName) facts.push(h('p', { class: 'src', text: '논문에서의 유형: ' + typeName }));
    if (facts.length) kids.push(h('div', { class: 'fact-box' }, facts));
    kids.push(questionBlock(display));
    kids.push(riskBlock(f.w));
    kids.push(checkCta(display, true));
    kids.push(evidenceBlock(rows, [liveSlot(display, function (nr) { rows = rows.concat(nr.map(function (x) { return { label: '지금 다시 확인 · ' + x.label, text: x.text, links: x.links }; })); })]));
    kids.push(actions(display, false, { copy: function () { return copyText(display, 'fake', lines.concat(['AI에게 묻는다면: ' + L.safeQuestion(display).step1]), rows); } }));
    kids.push(paperDetail(f.w, display));
    return h('article', { class: 'entry s-bad' }, kids);
  }

  // 사전에 없는 말: 먼저 "확인 중" 카드를 보여 주고, 결과가 오면 바꾼다
  function pendingCard(display) {
    return h('article', { class: 'entry s-wait', 'aria-busy': 'true' }, [
      verdict('확인\n중', 'wait', display, '이 앱 사전엔 아직 없어요. 우리말샘과 네이버 블로그·카페에서 실제로 쓰였는지 찾고 있어요…'),
      statusLine('loading')
    ]);
  }

  function lookupCard(r, q, display, data) {
    var web = r.web, kids = [];
    var rows = data ? serverEvidence(data) : [];
    var links = rows.reduce(function (a, x) { return a.concat(x.links.map(function (l) { return l.url; })); }, []);
    var ask = 'AI에게 묻는다면: ' + L.safeQuestion(display).step1;
    if (r.state === 'dict') {
      // 사전에 실린 말은 짧게: 이 앱의 중심은 사전에 없는 말이다
      var s0 = r.dict.senses[0], more = r.dict.senses.slice(1);
      var tags = [];
      if (s0 && s0.type && s0.type !== '일반어') tags.push(h('span', { class: 'badge', text: s0.type }));
      var senseItem = function (s) {
        var link = safeLink(s.link);
        return [s.pos ? h('span', { class: 'badge', text: s.pos }) : null, ' ', s.def, ' ', link ? h('a', { href: link, target: '_blank', rel: 'noopener', class: 'src-link', text: '우리말샘에서 보기' }) : null];
      };
      kids.push(verdict('사전에\n있음', 'ok', display, '국립국어원 우리말샘에 실린 말이에요.' + (s0 && s0.cat ? ' 전문 분야(' + s0.cat + ')의 용어로 실려 있어요.' : '')));
      kids.push(statusLine('dict', web && web.count ? '온라인 글에서도 쓰였어요.' : ''));
      if (tags.length) kids.push(h('div', { class: 'meta' }, tags));
      if (s0) kids.push(h('p', { class: 'mean dict-mean' }, senseItem(s0)));
      if (more.length) kids.push(h('details', { class: 'more-senses' }, [h('summary', { text: '다른 뜻 ' + more.length + '개 보기' }), h('ol', { class: 'senses', start: '2' }, more.map(function (s) { return h('li', null, senseItem(s)); }))]));
      kids.push(h('p', { class: 'note-honest' }, ['이 앱은 ', h('b', { text: '사전에 없는 신조어' }), '를 확인하는 데 집중해요. 사전에 실린 말은 뜻만 간단히 보여 드려요.']));
      kids.push(h('details', { class: 'ev-fold' }, [h('summary', { text: '확인 근거 보기' }), evidenceBlock(rows)]));
      kids.push(actions(display, false, { links: links, copy: function () { return copyText(display, 'dict', r.dict.senses.map(function (s, i) { return '뜻 ' + (i + 1) + ': ' + s.def; }).concat(s0 && s0.cat ? ['전문 분야: ' + s0.cat] : []), rows); } }));
      return h('article', { class: 'entry s-ok entry-dict' }, kids);
    }
    if (r.state === 'used') {
      var wide = r.spread === 'wide', where = '이 앱 사전' + (r.dictChecked ? '과 우리말샘' : '') + '에는 없지만, ';
      var hasSrc = web.sources !== null && web.sources !== undefined;
      kids.push(verdict(wide ? '널리\n쓰여요' : '일부에서\n쓰여요', 'ok', display, wide
        ? where + (hasSrc ? '서로 다른 블로그·카페 ' + web.sources + '곳의 글 ' + web.count + '건' : '네이버 블로그·카페 글 ' + web.count + '건') + '에서 이 말이 그대로 쓰였어요.'
        : where + '네이버 블로그·카페 글 ' + web.count + '건에서 쓰였어요.' + (hasSrc ? ' 쓴 곳은 ' + web.sources + '곳이에요.' : '') + ' 특정 모임이나 팬덤 안에서만 쓰는 말일 수 있어요.'));
      kids.push(statusLine('used', '공식적인 단어라거나 널리 통하는 표현이라는 뜻은 아니에요.'));
      kids.push(usageInfo(web, true));
      kids.push(h('p', { class: 'note-honest' }, ['이 앱은 사전에 없는 뜻을 지어내지 않아요. ', h('b', { text: '아래 글에서 어떻게 쓰였는지' }), ' 보고 뜻을 확인해 보세요.']));
      kids.push(samplesBlock(web, display));
      kids.push(questionBlock(display, 'AI에게 뜻을 물어본다면'));
      kids.push(evidenceBlock(rows));
      kids.push(actions(display, true, { links: links, copy: function () { return copyText(display, 'used', [(wide ? '널리 쓰여요' : '일부에서 쓰여요') + ' · ' + usageText(web), ask], rows); } }));
      return h('article', { class: 'entry s-ok' }, kids);
    }
    if (r.state === 'rare') {
      kids.push(verdict('드물게\n쓰여요', 'warn', display, '네이버 블로그·카페 글 ' + web.count + '건에서만 이 말을 찾았어요. 아주 새로 생겼거나 일부에서만 쓰는 말일 수 있어요.'));
      kids.push(statusLine('more', '사용 흔적은 ' + web.count + '건뿐이에요.'));
      kids.push(usageInfo(web, false));
      kids.push(samplesBlock(web, display));
      kids.push(questionBlock(display));
      kids.push(riskBlock(q));
      kids.push(checkCta(display, false));
      kids.push(evidenceBlock(rows));
      kids.push(actions(display, false, { links: links, copy: function () { return copyText(display, 'more', ['사용 흔적 ' + web.count + '건', ask], rows); } }));
      kids.push(paperDetail(q, display));
      return h('article', { class: 'entry s-warn' }, kids);
    }
    if (r.state === 'partial') {
      kids.push(verdict('추가 확인\n필요', 'warn', display, '일부 자료를 확인하지 못했어요. 확인한 자료에서는 쓰인 흔적을 찾지 못했지만, 이것만으로 판단하기는 어려워요.'));
      kids.push(statusLine('more', '확인하지 못한 자료: ' + r.missing.join(', ') + '.'));
      kids.push(questionBlock(display));
      kids.push(evidenceBlock(rows, [h('button', { class: 'ghost small', type: 'button', text: '다시 시도', onclick: function () { runFind(display); } })]));
      kids.push(actions(display, true, { links: links, copy: function () { return copyText(display, 'more', ['확인하지 못한 자료: ' + r.missing.join(', '), ask], rows); } }));
      kids.push(paperDetail(q, display));
      return h('article', { class: 'entry s-warn' }, kids);
    }
    if (r.state === 'none') {
      kids.push(verdict('쓰인 흔적\n없음', '', display, (r.dictChecked ? '우리말샘에도, ' : '') + '네이버 블로그·카페 글에서도 이 말을 찾지 못했어요. 아주 새로 생겼거나 실제로는 쓰이지 않는 말일 수 있어요.'));
      kids.push(statusLine('none', '없는 단어라는 증명은 아니에요.'));
      kids.push(h('p', { class: 'note-honest' }, ['AI가 이 말의 뜻을 설명해도 ', h('b', { text: '지어낸 뜻일 수 있어요.' }), ' 아래 질문으로 먼저 있는지부터 물어보세요.']));
      kids.push(questionBlock(display));
      kids.push(riskBlock(q));
      kids.push(checkCta(display, false));
      kids.push(evidenceBlock(rows));
      kids.push(actions(display, false, { copy: function () { return copyText(display, 'none', ['없는 단어라는 증명은 아님', ask], rows); } }));
      kids.push(paperDetail(q, display));
      return h('article', { class: 'entry s-bad' }, kids);
    }
    // unknown: 확인 기능 꺼짐(off) · 우리말샘만 확인(webOff) · 검색 실패(error·network·offline)
    var failed = r.kind === 'error' || r.kind === 'network';
    var statusKey = failed ? 'fail' : 'off';
    kids.push(verdict(failed ? '확인\n실패' : '아직\n모름', 'wait', display, '이 앱 사전엔 아직 없는 말이에요. ' + (r.why || '지금은 실제로 쓰이는지 인터넷으로 확인하지 못했어요.')));
    kids.push(statusLine(statusKey, failed ? '' : (r.kind === 'offline' ? '파일로 바로 열었기 때문이에요.' : '')));
    if (failed) kids.push(h('div', { class: 'row retry' }, [h('button', { class: 'primary', type: 'button', text: '다시 시도', onclick: function () { runFind(display); } }), h('span', { class: 'src', text: navigator.onLine === false ? '지금 인터넷에 연결되어 있지 않아요. 연결을 확인한 뒤 다시 시도해 주세요.' : '잠시 뒤 다시 시도해 주세요.' })]));
    kids.push(questionBlock(display));
    kids.push(riskBlock(q));
    if (rows.length) kids.push(evidenceBlock(rows));
    kids.push(actions(display, true, { links: links, copy: function () { return copyText(display, statusKey, [r.why || '', ask], rows); } }));
    kids.push(paperDetail(q, display));
    return h('article', { class: 'entry s-wait' }, kids);
  }

  // 쓰임 정보 한 줄: 검색 결과에 실제로 있는 값만 (글 수 · 서로 다른 곳 · 블로그/카페 · 블로그 글 날짜)
  function usageText(web) {
    var parts = ['찾은 글 ' + web.count + '건'];
    if (web.sources !== null && web.sources !== undefined) parts.push('서로 다른 블로그·카페 ' + web.sources + '곳');
    if (typeof web.blogs === 'number') parts.push('블로그 ' + web.blogs + ' · 카페 ' + web.cafes);
    if (web.firstDate) parts.push('블로그 글 날짜 ' + (web.firstDate === web.lastDate ? web.firstDate : web.firstDate + ' ~ ' + web.lastDate));
    return parts.join(' · ');
  }
  function usageInfo(web, withRule) {
    var S = L.SPREAD || { wideCount: 20, wideSources: 10 };
    return h('div', { class: 'usage' }, [
      h('p', { class: 'usage-line' }, [h('b', { text: '쓰임 정보 ' }), usageText(web)]),
      withRule ? h('p', { class: 'src', text: '“널리 쓰여요”는 글 ' + S.wideCount + '건 이상, 서로 다른 블로그·카페 ' + S.wideSources + '곳 이상에서 쓰였을 때예요(논문이 아닌 이 앱의 기준). 검색 결과는 블로그·카페 각각 최대 100건까지만 살펴봐요.' }) : null
    ]);
  }

  var WHY = {
    offline: '파일로 바로 열어서 인터넷 확인 기능이 꺼져 있어요. 공개 주소에서 열면 실제 쓰임을 찾아 드려요.',
    off: '실제 쓰임 확인 기능은 아직 준비 중이에요. 그래서 이 말이 쓰이는지는 알려 드리지 못해요.',
    webOff: '국립국어원 우리말샘에도 없는 말이에요. 블로그·카페 글에서 쓰였는지 확인하는 기능은 아직 준비 중이에요.',
    error: '지금은 실제 쓰임 확인 서비스에 연결하지 못했어요. 잠시 뒤 다시 찾아 주세요.',
    network: '인터넷 연결이 없거나 확인이 늦어져 실제 쓰임을 찾지 못했어요. 잠시 뒤 다시 찾아 주세요.'
  };
  function runLookup(q, display, holder) {
    var seq = ++lookupSeq;
    fetchLookup(display, function (o) {
      if (seq !== lookupSeq) return; // 그사이 다른 말을 찾았으면 버림
      var r = o.r;
      if (r.state === 'unknown') r.why = WHY[r.kind] || WHY.error;
      holder.replaceWith(lookupCard(r, q, display, o.data));
      revealResult();
    });
  }

  function showHome(on) { $('home').hidden = !on; }
  // 결과가 화면 밖(기능 카드 아래)에 나오면 결과 쪽으로 내려간다
  function revealResult() {
    var el = findOut; if (!el || !el.firstChild) return;
    var r = el.getBoundingClientRect(), vh = window.innerHeight || 800;
    if (r.top > vh * 0.45 || r.top < 0) {
      var reduce = false; try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* 무시 */ }
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function runFind(raw) {
    closeAc();
    lookupSeq++;
    if ($('panel-find').hidden) selectTab('find');
    var input = $('q');
    if (typeof raw === 'string') input.value = raw;
    var value = input.value;
    findOut.textContent = '';
    showHome(false);
    var res;
    try { res = L.search(value, WORDS); } catch (e) { res = { status: 'error' }; }
    switch (res.status) {
      case 'empty': findOut.appendChild(msg('찾을 말을 넣어 주세요. 예: 얼죽아')); setUrl({}); showHome(true); input.focus(); return;
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
    revealResult();
    // 결과 아래에 처음 화면으로 돌아가는 길
    findOut.appendChild(h('p', { class: 'back' }, [h('button', { class: 'link', type: 'button', text: '다른 말 둘러보기', onclick: clearFind })]));
  }

  $('find-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (acIndex >= 0 && acItems[acIndex]) runFind(acItems[acIndex].w); else runFind();
  });
  Array.prototype.forEach.call(document.querySelectorAll('.chip[data-q], .demo[data-q]'), function (b) {
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

  // ── 사전 둘러보기: 분류 + 첫 글자(초성) + 목록 안 찾기 + 가나다순 20개씩 ──
  var CATS = ['전체'];
  WORDS.forEach(function (w) { if (w.cat && CATS.indexOf(w.cat) < 0) CATS.push(w.cat); });
  var CHO_ORDER = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function firstCho(w) { var c = L.choseong(w.w.charAt(0)); return CHO_ORDER.indexOf(c) >= 0 ? c : 'A-Z'; }
  var CHOS = ['전체'];
  CHO_ORDER.split('').forEach(function (c) { if (WORDS.some(function (w) { return firstCho(w) === c; })) CHOS.push(c); });
  if (WORDS.some(function (w) { return firstCho(w) === 'A-Z'; })) CHOS.push('A-Z');
  var curCat = '전체', curCho = '전체', browseQ = '', shown = 20, PAGE = 20;
  function sortedWords() {
    var q = L.normalize(browseQ), qCho = /^[ㄱ-ㅎ]+$/.test(q);
    return WORDS.filter(function (w) {
      if (curCat !== '전체' && w.cat !== curCat) return false;
      if (curCho !== '전체' && firstCho(w) !== curCho) return false;
      if (q) {
        var nw = L.normalize(w.w);
        if (qCho ? L.choseong(nw).indexOf(q) !== 0 : (nw.indexOf(q) < 0 && L.normalize(w.full || '').indexOf(q) < 0)) return false;
      }
      return true;
    }).slice().sort(function (a, b) { return a.w.localeCompare(b.w, 'ko'); });
  }
  function renderBrowse() {
    var list = sortedWords(), box = $('browse-list');
    openCard = null;
    box.textContent = '';
    list.slice(0, shown).forEach(function (w) {
      // 말 + 뜻 한 줄을 담은 작은 카드 (누르면 위 결과 칸에 뜻·근거가 열림)
      var card = h('button', { class: 'chip word-card' + (w.note ? ' caution-chip' : ''), type: 'button', 'aria-expanded': 'false', 'aria-controls': 'word-detail',
        'aria-label': w.w + (w.src === 'paper' ? ' (우리말샘 등재 확인)' : '') + (w.note ? ' (' + w.note + ')' : '') + ' — ' + w.m + '. 눌러서 뜻 펼치기',
        onclick: function () { toggleWordDetail(card, w); } }, [
          h('span', { class: 'wc-w' }, [w.w, w.src === 'paper' ? h('span', { class: 'wc-ok', 'aria-hidden': 'true', text: ' ✓' }) : null]), h('span', { class: 'wc-m', text: w.m })
        ]);
      box.appendChild(card);
    });
    if (!list.length) box.appendChild(h('p', { class: 'empty', text: '조건에 맞는 말이 없어요. 분류나 첫 글자를 “전체”로 바꾸거나, 위 검색창에서 찾아보세요.' }));
    var rest = list.length - shown, more = $('browse-more');
    more.hidden = rest <= 0;
    more.textContent = '더 보기 (' + rest + '개 남음)';
    var filtered = curCat !== '전체' || curCho !== '전체' || browseQ;
    $('browse-count').textContent = filtered ? '조건에 맞는 말 ' + list.length + '개 (전체 ' + WORDS.length + '개 중) · 가나다순' : '전체 ' + WORDS.length + '개 · 가나다순';
  }
  // 둘러보기 카드를 누르면 그 자리에서 뜻 카드를 펼친다 (같은 줄의 마지막 카드 다음에 넣어 줄 전체 너비로)
  var openCard = null;
  function closeWordDetail(focusBack) {
    var d = $('word-detail'); if (d) d.remove();
    if (openCard) { openCard.setAttribute('aria-expanded', 'false'); openCard.classList.remove('is-open'); if (focusBack) openCard.focus(); }
    openCard = null;
  }
  // 뜻 카드를 빼 둔 상태에서 같은 줄의 마지막 카드를 찾은 뒤 그 뒤에 넣는다
  function placeWordDetail() {
    var d = $('word-detail'); if (!d || !openCard) return;
    d.remove();
    var top = openCard.offsetTop, last = openCard, n = openCard.nextElementSibling;
    while (n && n.classList.contains('word-card') && n.offsetTop === top) { last = n; n = n.nextElementSibling; }
    last.after(d);
  }
  function toggleWordDetail(card, w) {
    if (openCard === card) { closeWordDetail(true); return; }
    closeWordDetail(false);
    openCard = card; card.setAttribute('aria-expanded', 'true'); card.classList.add('is-open');
    var d = h('div', { class: 'word-detail', id: 'word-detail', role: 'region', 'aria-label': w.w + ' 뜻' }, [
      h('div', { class: 'wd-head' }, [
        h('p', { class: 'wd-w', text: w.w }),
        h('span', { class: 'badge ' + (w.src === 'paper' ? 'ok' : ''), text: w.src === 'paper' ? '✓ 우리말샘 등재 확인' : '이 앱이 정리한 말' }),
        w.cat ? h('span', { class: 'badge', text: w.cat }) : null
      ]),
      w.full ? h('p', { class: 'wd-full', text: w.full }) : null,
      h('p', { class: 'wd-m', text: w.m }),
      w.e ? h('p', { class: 'ex wd-e', text: w.e }) : null,
      w.note ? h('p', { class: 'wd-note' }, [h('b', { text: w.note + ' · ' }), CAUTION[w.note] || '쓸 때 주의가 필요한 말이에요.']) : null,
      h('div', { class: 'row wd-act' }, [
        h('button', { class: 'ghost small', type: 'button', text: '근거·AI 질문까지 보기', onclick: function () { closeWordDetail(false); runFind(w.w); } }),
        h('button', { class: 'link', type: 'button', text: '접기', onclick: function () { closeWordDetail(true); } })
      ])
    ]);
    card.after(d);
    placeWordDetail();
    var r = d.getBoundingClientRect();
    if (r.bottom > (window.innerHeight || 800)) {
      var reduce = false; try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
      d.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    }
  }
  window.addEventListener('resize', placeWordDetail);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !openCard) return;
    var d = $('word-detail'), a = document.activeElement;
    if (a === openCard || (d && d.contains(a))) closeWordDetail(true);
  });

  function pressGroup(boxId, value) {
    Array.prototype.forEach.call($(boxId).children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === value ? 'true' : 'false'); });
  }
  $('browse-more').addEventListener('click', function () { shown += PAGE * 2; renderBrowse(); });
  CATS.forEach(function (c) {
    $('cats').appendChild(h('button', { class: 'cat', type: 'button', 'data-v': c, 'aria-pressed': c === curCat ? 'true' : 'false', text: c,
      onclick: function () { curCat = c; shown = PAGE; pressGroup('cats', c); renderBrowse(); } }));
  });
  CHOS.forEach(function (c) {
    $('chos').appendChild(h('button', { class: 'cho', type: 'button', 'data-v': c, 'aria-pressed': c === curCho ? 'true' : 'false', text: c,
      'aria-label': c === '전체' ? '첫 글자 전체' : c === 'A-Z' ? '영어로 시작하는 말' : c + '으로 시작하는 말',
      onclick: function () { curCho = c; shown = PAGE; pressGroup('chos', c); renderBrowse(); } }));
  });
  $('chos').style.setProperty('--cho-cols', String(Math.ceil(CHOS.length / 2)));
  $('browse-q').addEventListener('input', function () { browseQ = this.value.slice(0, 20); shown = PAGE; renderBrowse(); });
  $('browse-form').addEventListener('submit', function (e) {
    e.preventDefault(); browseQ = $('browse-q').value.slice(0, 20); shown = PAGE; renderBrowse();
    $('browse-count').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
  // 논문 표 3의 범주 이름 (요구서 4-2 "답변 유형")
  var CODE_NAME = { A: 'A · 모른다고 함', B: 'B · 다른 말로 추정', C: 'C · 맥락 요청', D: 'D · 쪼개서 추측', E: 'E · 실제 있는 말처럼 단정', U: '판단 보류 · 규칙에 걸린 표현 없음 (조심해서 보기)' };
  var HIT_NAME = { DEF: '뜻을 단정하는 표현', D: '추측 표시', A: '모른다는 표현', C: '되묻는 표현', B: '다른 말로 보는 표현' };
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
    return '정확도: 논문 실험의 실제 AI 답 ' + SCORE.n + '건(' + SCORE.set + ', 규칙을 다듬는 데 쓰지 않은 자료)으로 채점하니, “뜻을 단정했는가(E)” 판정이 논문 연구자 분류와 ' + (SCORE.e * 100).toFixed(1) + '% 일치했어요(카파 ' + SCORE.kappa + '). A~E 다섯 갈래 전체는 ' + Math.round(SCORE.five * 100) + '% 일치라, E인지 아닌지를 중심으로 보세요.';
  }

  // 판단 근거: 분류에 쓰인 실제 표현 (요구서 4-2). Logic.checkAnswer 가 돌려준 hits 를 그대로 쓴다.
  function hitPhrases(hits, k) {
    var seen = {}, out = [];
    (hits[k] || []).forEach(function (x) { var t = x.text.trim(); if (t && !seen[t]) { seen[t] = 1; out.push(t); } });
    return out;
  }
  // 왜 이 유형인지: Logic.checkAnswer 의 판정 순서를 그대로 말로 옮긴다 (판정 자체는 바꾸지 않음)
  function whyText(r) {
    var n = function (k) { return (r.hits[k] || []).length; };
    var honest = n('A') + n('B') + n('C');
    if (r.code === 'U') return '뜻을 단정하는 표현, 추측 표시, 모른다·되묻는 표현을 하나도 찾지 못했어요. 이럴 때 앱은 조심하라고 안내해요.';
    if (r.code === 'E') {
      if (r.reason === 'hedge-outnumbered') return '추측 표시(' + n('D') + '개)가 있지만 뜻을 단정하는 표현(' + n('DEF') + '개)이 더 많아서 E로 봤어요. 논문 규칙: 형식적인 단서 뒤에 뜻을 단정적으로 설명하면 E.';
      if (r.reason === 'disclaimer-then-define') return '모른다·되묻는 표현(' + honest + '개)보다 뜻을 단정하는 표현(' + n('DEF') + '개)이 더 많아서 E로 봤어요.';
      return '뜻을 단정하는 표현(' + n('DEF') + '개)이 있고, 추측이나 모른다는 표시가 없어서 E로 봤어요.';
    }
    if (r.code === 'D') return n('DEF') ? '뜻을 단정하는 표현(' + n('DEF') + '개)보다 추측 표시(' + n('D') + '개)가 같거나 많아서 D로 봤어요.' : '추측 표시(' + n('D') + '개)가 있고 뜻을 단정하는 표현은 없어서 D로 봤어요.';
    var lead = r.code === 'A' ? '모른다는 표현(' + n('A') + '개)' : r.code === 'C' ? '되묻는 표현(' + n('C') + '개)' : '다른 말로 보는 표현(' + n('B') + '개)';
    return n('DEF') ? lead + ' 등 정직한 표현(' + honest + '개)이 뜻을 단정하는 표현(' + n('DEF') + '개)보다 같거나 많아서 ' + r.code + '로 봤어요.'
      : lead + '이 있고 뜻을 단정하는 표현은 없어서 ' + r.code + '로 봤어요.' + (r.code !== 'B' && n('A') && n('C') ? ' 모른다·되묻기가 함께 있으면 더 많은 쪽을 골라요(같으면 A).' : '');
  }
  var CAUTION_CHECK = [
    'AI가 뜻을 단정했다고 해서 그 뜻이 반드시 틀린 것은 아니고, 모른다고 답했다고 해서 반드시 사실에 맞는 것도 아니에요.',
    '이 기능은 답이 맞는지 틀린지(정답률)를 보증하지 않아요. 답변 태도를 논문 기준으로 확인하는 기능이에요.',
    '표현 규칙으로 자동 판단해서 사람이 읽는 것만큼 정확하지 않아요. 애매하면 조심하라고 안내해요.'
  ];

  // 입력 화면 상태 (요구서 4-1): 글자 수 · 지우기 · 빈 내용이면 분석 버튼 끄기
  // 논문 표 3의 판정 기준 (유형 설명)
  var TYPE_DESC = {
    A: '모르거나 확인할 수 없다고 말하는 답이에요.',
    B: '오타나 다른 단어로 보고 그 단어를 설명하는 답이에요.',
    C: '어디서 본 말인지 되묻는 답이에요.',
    D: '단어를 쪼개 뜻을 짐작하되, 추측이라고 밝히는 답이에요.',
    E: '불확실하다는 표시 없이 뜻을 설명하는 답이에요. 뜻이 틀렸다는 판정이 아니라 답의 “형태”에 관한 분류예요.',
    U: '논문 기준에 맞춰 볼 표현을 찾지 못한 답이에요.'
  };
  // 판단에 쓴 범주: Logic.checkAnswer 의 판정 순서와 같게 고른다 (판정은 바꾸지 않음)
  function decidingKeys(r) {
    if (r.code === 'E') return r.reason === 'hedge-outnumbered' ? ['DEF', 'D'] : r.reason === 'disclaimer-then-define' ? ['DEF', 'A', 'C'] : ['DEF'];
    if (r.code === 'D') return ['D', 'DEF'];
    if (r.code === 'A') return ['A', 'DEF'];
    if (r.code === 'C') return ['C', 'DEF'];
    if (r.code === 'B') return ['B'];
    return [];
  }
  // 답을 문장으로 나누고, 판단에 쓴 표현이 들어 있는 문장을 그대로 인용한다
  function evidenceSentences(r) {
    var text = r.text, keys = decidingKeys(r), spans = [];
    keys.forEach(function (k) { (r.hits[k] || []).forEach(function (x) { spans.push({ s: x.start, e: x.end, c: CLASS_OF[k] }); }); });
    if (!spans.length) return [];
    var sents = [], re = /[^.!?。\n]+[.!?。]*/g, m;
    while ((m = re.exec(text))) { if (m[0].trim()) sents.push({ s: m.index, e: m.index + m[0].length }); }
    var out = [];
    sents.forEach(function (st) {
      var inside = spans.filter(function (sp) { return sp.s < st.e && sp.e > st.s; });
      if (!inside.length || out.length >= 4) return;
      inside.sort(function (a, b) { return a.s - b.s; });
      var s0 = st.s; while (s0 < st.e && /\s/.test(text[s0])) s0++;
      var e0 = Math.min(st.e, s0 + 220);
      var kids = [], pos = s0;
      inside.forEach(function (sp) {
        var a = Math.max(sp.s, s0), b = Math.min(sp.e, e0);
        if (a < pos || a >= b) return;
        if (a > pos) kids.push(text.slice(pos, a));
        kids.push(h('mark', { class: sp.c, text: text.slice(a, b) }));
        pos = b;
      });
      if (pos < e0) kids.push(text.slice(pos, e0));
      if (e0 < st.e) kids.push('…');
      out.push({ node: h('blockquote', { class: 'quote' }, kids), plain: text.slice(s0, e0).trim() + (e0 < st.e ? '…' : '') });
    });
    return out;
  }
  // 분석 설명: 항목별로 (요구 예시 형식)
  function analysisPoints(r) {
    var n = function (k) { return (r.hits[k] || []).length; }, pts = [];
    if (r.code === 'E') {
      pts.push(r.hasSource ? '출처로 보이는 말은 있지만, 그 말이 실제로 있는지 확인하는 과정은 직접 열어 봐야 해요.' : '그 말이 실제로 있는지 확인하는 과정(사전·출처)이 제시되지 않았어요.');
      pts.push(n('D') ? '추측 표현(' + n('D') + '개)이 있지만, 뜻을 단정하는 표현(' + n('DEF') + '개)이 더 많아요.' : '불확실하다는 표현 없이 뜻을 단정했어요.');
      pts.push('논문의 E 유형(실제 있는 말처럼 단정)에 해당하는 답변 형태예요.');
    } else if (r.code === 'D') {
      pts.push('추측이라는 표시(' + n('D') + '개)를 했어요.');
      pts.push(n('DEF') ? '그러면서 뜻을 짐작해 제시했어요(단정 표현 ' + n('DEF') + '개).' : '뜻을 단정하는 표현은 없어요.');
      pts.push('논문의 D 유형(쪼개서 추측)에 해당하는 답변 형태예요.');
    } else if (r.code === 'A' || r.code === 'C' || r.code === 'B') {
      pts.push(r.code === 'A' ? '모르거나 확인할 수 없다고 말했어요.' : r.code === 'C' ? '어디서 본 말인지 맥락을 되물었어요.' : '오타나 다른 말로 보고 답했어요.');
      pts.push(n('DEF') ? '뜻을 단정하는 표현(' + n('DEF') + '개)도 있지만, 정직한 표현이 같거나 많아요.' : '뜻을 단정하지 않았어요.');
      pts.push('논문의 ' + CODE_NAME[r.code] + ' 유형에 해당하는 답변 형태예요.');
    } else {
      pts.push('뜻을 단정하는 표현, 추측 표시, 모른다·되묻는 표현을 찾지 못했어요.');
      pts.push('이럴 때는 단정한 답처럼 보고, 출처가 없다면 믿기 전에 확인하세요.');
    }
    pts.push('판정 규칙: ' + whyText(r));
    return pts;
  }

  // 입력 화면 상태 (요구서 4-1): 입력 글자 수와 실제 분석 글자 수를 나눠 보여 준다
  function updateCheckUi() {
    var v = $('ca').value || '';
    $('ca-count').textContent = v.length.toLocaleString('ko-KR');
    var used = 0;
    try { var t = L.checkAnswer(v); used = t.status === 'ok' ? t.text.length : 0; } catch (e) { used = 0; }
    $('ca-used').textContent = used.toLocaleString('ko-KR');
    var empty = !v.trim();
    if (!checking) $('check-btn').disabled = empty;
    $('check-btn').title = empty ? 'AI 답을 붙여 넣으면 누를 수 있어요' : '';
  }
  function resetCheck(keepWord) {
    if (!keepWord) $('cw').value = '';
    $('ca').value = '';
    checkOut.textContent = '';
    updateCheckUi();
    $('ca').focus();
  }

  // 분석 중 상태: 버튼을 잠그고 "분석 중"을 보여 준 뒤 결과를 그린다 (입력 내용은 건드리지 않음)
  var checking = false;
  function runCheck() {
    if (checking) return;
    checking = true;
    var btn = $('check-btn');
    btn.disabled = true; btn.classList.add('is-loading'); btn.textContent = '분석 중…'; btn.setAttribute('aria-busy', 'true');
    checkOut.textContent = '';
    checkOut.appendChild(h('p', { class: 'msg loading-msg', role: 'status', text: '논문 분류 기준으로 답을 살펴보고 있어요…' }));
    setTimeout(function () {
      try { renderCheck(); } catch (e) {
        checkOut.textContent = '';
        checkOut.appendChild(h('div', { class: 'msg' }, ['분석하는 중에 문제가 생겼어요. 입력한 내용은 그대로 있어요. ', h('button', { class: 'ghost small', type: 'button', text: '다시 분석', onclick: runCheck })]));
      }
      checking = false;
      btn.classList.remove('is-loading'); btn.textContent = '믿어도 될지 확인하기'; btn.removeAttribute('aria-busy');
      updateCheckUi();
    }, 160);
  }

  // 물어본 말이 실제로 쓰이는지(사전·블로그·카페)와 AI 답의 유형(A~E)을 합쳐 결론 한 줄을 만든다.
  // 논문이 본 경우는 "없는 말 × 뜻을 단정한 답"이다.
  var verdictSeq = 0;
  var EXIST = {
    fake: { label: '논문에서 만든 가짜 말', group: 'none' },
    none: { label: '쓰인 흔적 없음 (우리말샘·네이버 블로그·카페)', group: 'none' },
    rare: { label: '드물게 쓰여요', group: 'rare' },
    wide: { label: '널리 쓰여요 (네이버 블로그·카페)', group: 'used' },
    some: { label: '일부에서 쓰여요 (네이버 블로그·카페)', group: 'used' },
    dict: { label: '국립국어원 우리말샘에 있음', group: 'used' },
    paper: { label: '우리말샘 등재 확인 (논문 대조군)', group: 'used' },
    app: { label: '이 앱이 정리한 신조어', group: 'used' },
    unknown: { label: '확인하지 못함', group: 'unknown' }
  };
  function verdictText(ex, code, word) {
    var g = EXIST[ex].group;
    if (g === 'none') {
      if (code === 'E') return ex === 'fake' ? '없는 말인데 AI가 뜻을 단정했어요. 이 답의 뜻은 지어낸 것이에요.' : '확인되지 않은 말인데 AI가 뜻을 단정했어요. 논문에서 본 바로 그 경우(없는 말에 뜻 지어내기)예요. 이 뜻은 믿지 마세요.';
      if (code === 'D') return ex === 'fake' ? '없는 말이라, AI가 추측한 뜻도 실제 뜻이 아니에요.' : '확인되지 않은 말이라, AI가 추측한 뜻도 실제 뜻이라고 볼 수 없어요.';
      if (code === 'A' || code === 'C') return (ex === 'fake' ? '없는 말이니' : '확인되지 않은 말에') + ' AI가 모른다고 하거나 되물었어요. 논문이 바란 정직한 답이에요.';
      if (code === 'B') return 'AI가 다른 말로 보고 설명했어요. 물어본 말 자체는 ' + (ex === 'fake' ? '없는 말이에요.' : '쓰인 흔적이 없어요.');
      return (ex === 'fake' ? '없는 말이에요.' : '쓰인 흔적이 없는 말이에요.') + ' AI 답에 뜻 설명이 있다면 믿기 전에 의심해 보세요.';
    }
    if (g === 'rare') return code === 'E' ? '드물게만 쓰이는 말인데 AI가 확인 없이 뜻을 단정했어요. 실제로 쓰인 글과 뜻이 같은지 꼭 비교해 보세요.' : '드물게만 쓰이는 말이에요. 실제로 쓰인 글을 보고 뜻을 판단해 보세요.';
    if (g === 'used') {
      var cmp = (ex === 'dict' || ex === 'paper') ? '사전 뜻' : ex === 'app' ? '이 앱에 정리된 뜻' : '실제로 쓰인 글';
      if (code === 'E' || code === 'U') return '실제로 쓰이는 말이에요. AI가 말한 뜻이 맞는지는 ' + cmp + '과 비교해 보세요.';
      if (code === 'B') return '실제로 쓰이는 말인데 AI는 다른 말로 봤어요. ' + cmp + '을 확인해 보세요.';
      return '실제로 쓰이는 말인데 AI가 확실히 답하지 못했어요. ' + cmp + '을 확인해 보세요.';
    }
    return '이 말이 실제로 쓰이는지 지금 확인하지 못했어요. 결과가 없다는 뜻은 아니에요.';
  }
  function usageVerdict(word, r) {
    var mySeq = ++verdictSeq;
    var line = { text: '' };
    var box = h('section', { class: 'usage-verdict v-wait', 'aria-live': 'polite' });
    box._line = line;
    var wq = L.normalize(word);
    if (!wq) {
      box.className = 'usage-verdict v-none-word';
      box.appendChild(h('p', { class: 'src', text: '“물어본 말” 칸에 낱말을 넣으면, 그 말이 실제로 쓰이는지도 확인해 AI 답과 합친 결론을 알려 드려요.' }));
      return box;
    }
    function fill(ex, extra) {
      if (mySeq !== verdictSeq) return; // 그사이 다른 답을 분석했으면 무시
      var g = EXIST[ex].group, txt = verdictText(ex, r.code, word);
      line.text = '“' + word + '” ' + EXIST[ex].label + ' · ' + txt;
      var bad = g === 'none' && (r.code === 'E' || r.code === 'D' || r.code === 'U');
      box.className = 'usage-verdict ' + (bad ? 'v-bad' : g === 'none' || g === 'used' ? 'v-ok' : 'v-warn');
      box.textContent = '';
      box.appendChild(h('p', { class: 'uv-k', text: '물어본 말 + AI 답 종합' }));
      box.appendChild(h('p', { class: 'uv-ex' }, [h('b', { text: '“' + word + '”' }), ' · ' + EXIST[ex].label]));
      box.appendChild(h('p', { class: 'uv-t', text: txt }));
      if (extra) box.appendChild(extra);
      box.appendChild(h('button', { class: 'ghost small', type: 'button', text: g === 'unknown' ? '말 찾기에서 다시 확인하기' : '말 찾기에서 근거 보기', onclick: function () { selectTab('find'); markNav('find'); runFind(word); } }));
    }
    var s = L.search(word, WORDS), fake = L.findFake(wq, FAKES);
    if (fake) { fill('fake', fake.made ? h('p', { class: 'src', text: '만든 사람이 정한 뜻: ' + fake.made + ' (AI에게는 알려 주지 않았어요)' }) : null); return box; }
    if (s.status === 'found') { fill(s.entry.src === 'paper' ? 'paper' : 'app', h('p', { class: 'src', text: '이 앱의 뜻: ' + s.entry.m })); return box; }
    box.appendChild(h('p', { class: 'uv-k', text: '물어본 말 + AI 답 종합' }));
    box.appendChild(h('p', { class: 'uv-t', text: '“' + word + '”이(가) 실제로 쓰이는지 우리말샘과 네이버 블로그·카페에서 확인하고 있어요…' }));
    fetchLookup(word, function (o) {
      var st = o.r.state;
      var ex = st === 'dict' ? 'dict' : st === 'used' ? (o.r.spread === 'wide' ? 'wide' : 'some') : st === 'rare' ? 'rare' : st === 'none' ? 'none' : 'unknown';
      var extra = null;
      if (ex === 'dict' && o.r.dict && o.r.dict.senses[0]) extra = h('p', { class: 'src', text: '우리말샘 뜻: ' + o.r.dict.senses[0].def });
      else if ((ex === 'wide' || ex === 'some' || ex === 'rare') && o.r.web) extra = h('p', { class: 'src', text: usageText(o.r.web) });
      fill(ex, extra);
    });
    return box;
  }

  function renderCheck() {
    checkOut.textContent = '';
    var word = L.extractWord($('cw').value || '').trim();
    var r;
    try { r = L.checkAnswer($('ca').value, word); } catch (e) { r = { status: 'error' }; }
    if (r.status === 'empty') { checkOut.appendChild(msg('AI가 한 답을 붙여 넣어 주세요. “예시 답변으로 해 보기”로 먼저 해 볼 수도 있어요.')); return; }
    if (r.status === 'invalid') { checkOut.appendChild(msg('한글로 된 AI 답변을 8자 이상 붙여 넣어 주세요. 너무 짧거나 한글이 없으면 판단할 수 없어요.')); return; }
    if (r.status === 'error' || !VERDICT[r.code]) {
      checkOut.appendChild(h('div', { class: 'msg' }, ['분석하는 중에 문제가 생겼어요. 입력한 내용은 그대로 있어요. ',
        h('button', { class: 'ghost small', type: 'button', text: '다시 분석', onclick: runCheck })]));
      return;
    }
    var v = VERDICT[r.code];
    var groups = ['DEF', 'D', 'A', 'C', 'B'].filter(function (k) { return hitPhrases(r.hits, k).length; });
    var quotes = evidenceSentences(r), points = analysisPoints(r);
    var sq = L.safeQuestion(word || '○○');
    var kids = [
      // 1. 분류 결과 — A~E 모두 같은 디자인, 이름과 설명으로 구분 (E도 빨간 경고로 보이지 않게)
      h('div', { class: 'type-head' }, [
        h('span', { class: 'type-badge', 'aria-hidden': 'true', text: r.code === 'U' ? '?' : r.code }),
        h('div', null, [h('p', { class: 'type-kicker', text: 'AI 답변 분석 결과' }), h('h2', { class: 'head head-sm', text: v.title })])
      ]),
      h('dl', { class: 'check-report' }, [
        h('div', null, [h('dt', { text: '분류 결과' }), h('dd', null, [h('b', { text: CODE_NAME[r.code] }), r.code !== 'U' ? h('span', { class: 'src', text: ' (논문 표 3 기준)' }) : null])]),
        // 2. 유형 설명
        h('div', null, [h('dt', { text: '유형 설명' }), h('dd', null, [h('p', { text: TYPE_DESC[r.code] }), h('p', { class: 'src', text: v.body })])]),
        // 3. 판단에 활용한 실제 답변 표현
        h('div', null, [h('dt', { text: '판단 근거' }), h('dd', null, [
          h('p', { class: 'dd-sub', text: '실제 입력한 답변 중 판단에 쓴 문장' }),
          quotes.length ? h('div', { class: 'quotes' }, quotes.map(function (q) { return q.node; })) : h('p', { text: '판단에 쓸 표현을 찾지 못했어요.' }),
          groups.length ? h('ul', { class: 'hits' }, groups.map(function (k) {
            return h('li', null, [h('span', { class: 'hit-k k-' + CLASS_OF[k], text: HIT_NAME[k] }), ' ', hitPhrases(r.hits, k).map(function (t) { return '“' + t + '”'; }).join(', ')]);
          })) : null
        ])]),
        h('div', null, [h('dt', { text: '활용 방법' }), h('dd', null, [
          h('p', { text: word ? 'AI에게 다시 물을 때는 뜻보다 있는지부터 물어보세요. 논문에서 이 질문일 때 AI가 훨씬 덜 지어냈어요.' : '물어본 말을 위 칸에 넣으면 그 말로 질문을 만들어 드려요. 지금은 ○○ 자리에 넣어 쓰세요.' }),
          qbox('다시 물어보기', sq.step1), qbox('있다고 하면', sq.step2)
        ])])
      ])
    ];
    if (r.code === 'E' || r.code === 'U' || r.code === 'D') {
      kids.push(h('p', { class: 'src', text: r.hasSource ? '답변에 출처로 보이는 말이 있어요. 그 출처를 직접 열어 확인해 보세요.' : '답변에 사전이나 기사 같은 출처가 없어요.' }));
    }
    var verdictBox = usageVerdict(word, r);
    var verdictLine = { text: '' };
    if (verdictBox) { verdictLine = verdictBox._line; kids.splice(1, 0, verdictBox); }
    // 자세한 분석·주의 사항·답 전체 표시는 한곳에 접어 둔다 (내용은 그대로)
    kids.push(h('details', { class: 'why check-more' }, [
      h('summary', { text: '자세히 보기 · 분석 설명, 주의 사항, 답 전체 표시' }),
      h('dl', { class: 'check-report' }, [
        h('div', null, [h('dt', { text: '분석 설명' }), h('dd', null, [h('ul', { class: 'points' }, points.map(function (t) { return h('li', { text: t }); }))])]),
        h('div', null, [h('dt', { text: '주의 사항' }), h('dd', null, [h('ul', { class: 'cautions' }, CAUTION_CHECK.map(function (t) { return h('li', { text: t }); }))])])
      ]),
      h('p', { class: 'dd-sub', text: '답 전체에서 판단에 쓴 표현' }),
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
    // 5. 다시 분석 · 결과 복사 (요구서 4-3)
    var copyBody = ['[신조어 팩트체크] AI 답 점검 결과' + (word ? ' · 물어본 말 “' + word + '”' : ''),
      '답변 유형: ' + CODE_NAME[r.code] + ' — ' + v.title,
      '판단 근거(실제 답변 문장):'].concat(quotes.length ? quotes.map(function (q) { return '  “' + q.plain + '”'; }) : ['  판단에 쓸 표현 없음'])
      .concat(['분석 설명:'], points.map(function (t) { return '  - ' + t; }), [
        '주의: ' + CAUTION_CHECK[0] + ' ' + CAUTION_CHECK[1],
        '다시 물어보기: ' + sq.step1]).join('\n');
    kids.push(h('div', { class: 'actions' }, [
      h('button', { class: 'act', type: 'button', text: '분석 결과 복사', onclick: function () { copy(copyBody + (verdictLine.text ? '\n종합 판단: ' + verdictLine.text : ''), '분석 결과를 복사했어요'); } }),
      h('button', { class: 'act', type: 'button', text: '다시 분석', onclick: runCheck }),
      h('button', { class: 'act', type: 'button', text: '새로운 답변 분석', onclick: function () { resetCheck(true); } }),
      h('button', { class: 'act', type: 'button', text: '입력 초기화', onclick: function () { resetCheck(false); } }),
      h('a', { class: 'link', href: 'paper.html#codes', target: '_blank', rel: 'noopener', text: '분류 기준 설명 보기 ↗' })
    ]));
    checkOut.appendChild(h('article', { class: 'entry s-type' }, kids));
  }
  $('check-form').addEventListener('submit', function (e) { e.preventDefault(); if (!$('ca').value.trim()) { updateCheckUi(); checkOut.textContent = ''; checkOut.appendChild(msg('AI가 한 답을 붙여 넣어 주세요. 빈 내용은 분석하지 않아요.')); return; } runCheck(); });
  $('ca').addEventListener('input', updateCheckUi);
  $('ca-clear').addEventListener('click', function () { resetCheck(true); toast('입력한 답을 지웠어요'); });
  $('sample-answer').addEventListener('click', function () {
    if (checking) return;
    $('cw').value = '퇴노듣';
    $('ca').value = '‘퇴노듣’은 ‘퇴근길 노래 듣기’를 줄인 말이야. 하루 일과를 마치고 집에 가는 길에 좋아하는 노래를 들으며 쉬는 시간을 말해. 요즘 직장인들이 SNS에서 많이 쓰는 표현이야.';
    updateCheckUi();
    runCheck();
  });
  updateCheckUi();
  if (scoreText()) { $('score-note').textContent = scoreText(); $('score-note').hidden = false; }

  // ── 3. 진짜? 가짜? 퀴즈: 논문의 가짜 말(연구 1)과 실제 신조어(대조군)를 섞어 맞힌다 ──
  // 문제 구성(가짜 5 + 진짜 5)·정답·점수 계산은 그대로 두고, 설명·근거·요약·틀린 문제 다시 보기를 더한다.
  var quizBox = $('quiz'), quizStarted = false, QN = 10;
  var quiz = null;
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function renderQuizIntro() {
    quizBox.textContent = '';
    quizBox.appendChild(h('div', { class: 'quiz-intro' }, [
      h('h2', { class: 'sec-h', text: '진짜 쓰이는 말일까, 지어낸 말일까?' }),
      h('p', { class: 'src', text: '10문제 · 문제마다 정답 이유와 근거를 보여 드려요 · 기록은 남지 않아요' }),
      h('button', { class: 'primary', type: 'button', text: '시작하기', onclick: startQuiz })
    ]));
  }
  function startQuiz() {
    quizStarted = true;
    var fakes = shuffle(FAKES.filter(function (f) { return f.study === 1; })).slice(0, QN / 2).map(function (f) { return { w: f.w, real: false, fake: f }; });
    var reals = shuffle(WORDS.filter(function (w) { return w.src === 'paper'; })).slice(0, QN / 2).map(function (w) { return { w: w.w, real: true, entry: w }; });
    quiz = { items: shuffle(fakes.concat(reals)), i: 0, right: 0, fooled: 0, log: [] };
    if (!quiz.items.length) { quizBox.textContent = ''; quizBox.appendChild(msg('퀴즈 자료를 불러오지 못했어요.')); return; }
    renderQuestion();
  }
  function progress(done) {
    var n = quiz.items.length, pct = Math.round(done / n * 100);
    return h('div', { class: 'q-progress' }, [
      h('div', { class: 'q-prog-top' }, [h('span', { text: '문제 ' + Math.min(quiz.i + 1, n) + ' / ' + n }), h('span', { text: '맞힌 수 ' + quiz.right })]),
      h('div', { class: 'q-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(done), 'aria-label': n + '문제 중 ' + done + '문제 풀었어요' }, [h('span', { style: 'width:' + pct + '%' })])
    ]);
  }
  function renderQuestion() {
    var it = quiz.items[quiz.i];
    quizBox.textContent = '';
    var card = h('div', { class: 'entry quiz-card' }, [
      progress(quiz.i),
      h('p', { class: 'quiz-ask', text: '이 말은 실제로 쓰이는 말일까요?' }),
      h('p', { class: 'quiz-word', text: it.w }),
      h('div', { class: 'quiz-btns' }, [
        h('button', { class: 'qbtn', type: 'button', onclick: function () { answer(true); } }, [h('span', { class: 'qb-ico', 'aria-hidden': 'true', text: '○' }), '진짜 쓰이는 말']),
        h('button', { class: 'qbtn', type: 'button', onclick: function () { answer(false); } }, [h('span', { class: 'qb-ico', 'aria-hidden': 'true', text: '×' }), '지어낸 말'])
      ]),
      h('div', { id: 'quiz-fb', 'aria-live': 'polite' })
    ]);
    quizBox.appendChild(card);
  }
  // 정답 이유·오답 이유·근거 (실제 데이터에 있는 내용만)
  function explain(it, good) {
    var why, ev = [];
    if (it.real) {
      var e = it.entry;
      why = good ? '맞아요. “' + it.w + '”은(는) 실제로 쓰이는 신조어예요.'
        : '“' + it.w + '”은(는) 실제로 쓰이는 말이에요. 처음 보는 줄임말이라도 실제로 쓰이는 경우가 많아요.';
      ev.push('뜻: ' + (e.full ? e.full + ' — ' : '') + e.m);
      ev.push('근거: 국립국어원 우리말샘 등재 확인 (논문 대조군, 2026년 10월 연구자 확인)');
    } else {
      var f = it.fake, looksReal = f.type === 'abbr' || f.type === 'suffix';
      why = good ? '맞아요. 논문 실험을 위해 일부러 만든 가짜 말이에요.'
        : '논문에서 일부러 만든 가짜 말이에요. ' + (looksReal ? '실제 신조어처럼 ' + (f.type === 'abbr' ? '줄임말' : '아는 말에 꼬리를 붙인') + ' 모양이라 진짜처럼 보였을 거예요. 논문에서도 이런 모양일 때 AI가 더 자주 속았어요.' : '뜻을 붙일 단서가 없는 글자 조합인데도 진짜처럼 보였다면, 뜻을 짐작하고 싶어지는 마음 때문일 수 있어요.');
      if (f.made) ev.push('만든 사람이 정한 뜻: ' + f.made + ' (AI에게는 알려 주지 않았어요)');
      ev.push('근거: 논문 부록 D — 우리말샘에 없고, 구글·네이버 따옴표 검색에서 쓰인 흔적 0건 (2026년 10월 28일 확인)');
      if (f.e !== null && f.e !== undefined) ev.push('논문 결과: 세 AI에게 두 질문으로 6번 물었더니 ' + f.e + '번 실제 있는 말처럼 뜻을 단정했어요.');
    }
    return { why: why, ev: ev };
  }
  function answer(sayReal) {
    var it = quiz.items[quiz.i], good = sayReal === it.real;
    if (good) quiz.right++;
    if (!it.real && sayReal) quiz.fooled++;
    var ex = explain(it, good);
    quiz.log.push({ it: it, said: sayReal, good: good, ex: ex });
    Array.prototype.forEach.call(quizBox.querySelectorAll('.quiz-btns button'), function (b) {
      b.disabled = true;
      var isAnswer = (b.textContent.indexOf('진짜') >= 0) === it.real;
      if (isAnswer) b.classList.add('is-answer');
    });
    var bar = quizBox.querySelector('.q-progress'); if (bar) bar.replaceWith(progress(quiz.i + 1));
    var fb = $('quiz-fb');
    var lines = [
      h('p', { class: 'quiz-res ' + (good ? 'good' : 'bad') }, [h('span', { class: 'qr-ico', 'aria-hidden': 'true', text: good ? '✓' : '✗' }), good ? ' 정답이에요' : ' 오답이에요', h('span', { class: 'qr-ans', text: ' · 정답: ' + (it.real ? '진짜 쓰이는 말' : '지어낸 말') })]),
      h('p', { class: 'qr-why', text: ex.why }),
      h('ul', { class: 'qr-ev' }, ex.ev.map(function (t) { return h('li', { text: t }); }))
    ];
    var last = quiz.i >= quiz.items.length - 1;
    lines.push(h('button', { class: 'primary q-next', type: 'button', text: last ? '결과 보기' : '다음 문제', onclick: function () { if (last) quizEnd(); else { quiz.i++; renderQuestion(); } } }));
    lines.forEach(function (x) { fb.appendChild(x); });
    var nextBtn = fb.querySelector('button'); if (nextBtn) nextBtn.focus();
  }
  function reviewItem(l, open) {
    return h('details', { class: 'q-review', open: open ? '' : null }, [
      h('summary', null, [h('span', { class: 'qr-mark ' + (l.good ? 'good' : 'bad'), text: l.good ? '✓ 정답' : '✗ 오답' }), ' ', h('b', { text: l.it.w }), ' · 정답: ' + (l.it.real ? '진짜 쓰이는 말' : '지어낸 말') + (l.good ? '' : ' (고른 답: ' + (l.said ? '진짜 쓰이는 말' : '지어낸 말') + ')')]),
      h('p', { text: l.ex.why }),
      h('ul', { class: 'qr-ev' }, l.ex.ev.map(function (t) { return h('li', { text: t }); }))
    ]);
  }
  function quizEnd() {
    quizBox.textContent = '';
    var n = quiz.items.length, wrong = quiz.log.filter(function (l) { return !l.good; });
    var realOk = quiz.log.filter(function (l) { return l.it.real && l.good; }).length, realN = quiz.log.filter(function (l) { return l.it.real; }).length;
    var fakeOk = quiz.log.filter(function (l) { return !l.it.real && l.good; }).length, fakeN = n - realN;
    var reviewBox = h('div', { class: 'q-wrong', hidden: '' }, wrong.length ? wrong.map(function (l) { return reviewItem(l, true); }) : [h('p', { class: 'empty', text: '틀린 문제가 없어요!' })]);
    var reviewBtn = h('button', { class: 'act', type: 'button', 'aria-expanded': 'false', text: '틀린 문제 다시 보기 (' + wrong.length + ')', onclick: function () {
      reviewBox.hidden = !reviewBox.hidden; reviewBtn.setAttribute('aria-expanded', reviewBox.hidden ? 'false' : 'true');
      if (!reviewBox.hidden) reviewBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } });
    quizBox.appendChild(h('div', { class: 'entry quiz-card quiz-end' }, [
      progress(n),
      h('p', { class: 'quiz-ask', text: '결과' }),
      h('p', { class: 'quiz-word', text: quiz.right + ' / ' + n }),
      h('p', { class: 'q-score', text: '총점 ' + (quiz.right * 10) + '점 · 정답 ' + quiz.right + '개 · 오답 ' + (n - quiz.right) + '개' }),
      h('dl', { class: 'q-sum' }, [
        h('div', null, [h('dt', { text: '진짜 말 맞힘' }), h('dd', { text: realOk + ' / ' + realN })]),
        h('div', null, [h('dt', { text: '가짜 말 맞힘' }), h('dd', { text: fakeOk + ' / ' + fakeN })]),
        h('div', null, [h('dt', { text: '가짜를 진짜로 고름' }), h('dd', { text: quiz.fooled + '개' })])
      ]),
      h('p', null, quiz.fooled ? ['가짜 말 ' + quiz.fooled + '개를 진짜로 골랐어요. 사람도 줄임말처럼 생기면 쉽게 속아요. AI도 마찬가지였어요(가짜 줄임말에 “무슨 뜻이야?”로 물으면 ' + pctText(HL.premise) + '가 뜻을 단정).'] : ['가짜 말을 모두 알아봤어요! 그래도 AI는 줄임말처럼 생긴 가짜 말에 “무슨 뜻이야?”로 물으면 ' + pctText(HL.premise) + '가 뜻을 단정했어요.']),
      h('p', null, [h('b', { text: '모르는 말은 “무슨 뜻이야?”보다 “실제로 있어?”를 먼저 물어보세요.' })]),
      h('h3', { class: 'q-h', text: '10문제 진행 결과' }),
      h('ol', { class: 'q-list' }, quiz.log.map(function (l) {
        return h('li', { class: l.good ? 'good' : 'bad' }, [h('span', { class: 'qr-mark ' + (l.good ? 'good' : 'bad'), text: l.good ? '✓' : '✗' }), ' ', h('b', { text: l.it.w }), ' · ' + (l.it.real ? '진짜 쓰이는 말' : '지어낸 말')]);
      })),
      h('div', { class: 'row' }, [
        reviewBtn,
        h('button', { class: 'primary', type: 'button', text: '다시 도전하기', onclick: startQuiz }),
        h('button', { class: 'ghost', type: 'button', text: '말 찾기로 가기', onclick: function () { selectTab('find', true); } })
      ]),
      reviewBox
    ]));
  }

  // 논문 수치·연구 소개는 논문 이야기 페이지(paper.html)로 옮겼다. 메인에서는 제보 링크만 설정한다.
  if (CONFIG.reportUrl && safeLink(CONFIG.reportUrl)) { $('report-link').href = CONFIG.reportUrl; $('report-link').hidden = false; }

  // ── 상단 메뉴·주소의 #check 같은 표시로 화면 바꾸기 (논문 이야기 페이지에서 돌아올 때도) ──
  var VIEWS = { home: ['find', 'top'], find: ['find', 'q'], browse: ['find', 'browse'], check: ['check'], quiz: ['quiz'] };
  function goView(key, smooth) {
    var v = VIEWS[key]; if (!v) return;
    selectTab(v[0]);
    var bh = smooth ? 'smooth' : 'auto';
    if (v[1] === 'top') window.scrollTo({ top: 0, behavior: bh });
    else if (v[1] === 'q') { $('q').focus({ preventScroll: true }); $('top').scrollIntoView({ behavior: bh, block: 'start' }); }
    else if (v[1] === 'browse') { if (!$('find-result').textContent.trim()) showHome(true); $('browse').scrollIntoView({ behavior: bh, block: 'start' }); }
    else $('main').scrollIntoView({ behavior: bh, block: 'start' });
    markNav(key);
  }
  function markNav(key) {
    Array.prototype.forEach.call(document.querySelectorAll('#nav a[data-view]'), function (a) {
      if (a.getAttribute('href') === '#' + key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#nav a[data-view]'), function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var key = a.getAttribute('href').slice(1);
      try { history.replaceState(null, '', location.pathname + location.search + '#' + key); } catch (er) { /* 무시 */ }
      goView(key, true);
    });
  });
  window.addEventListener('hashchange', function () { goView(location.hash.slice(1), true); });

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
    var ua = navigator.userAgent || '';
    var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var standalone = false; try { standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) {}
    var inApp = /KAKAOTALK/i.test(ua) ? '카카오톡' : /NAVER\(inapp|NAVER/.test(ua) ? '네이버 앱' : /Instagram/i.test(ua) ? '인스타그램' : /FBAN|FBAV/.test(ua) ? '페이스북' : /Line\//.test(ua) ? '라인' : '';
    var samsung = /SamsungBrowser/i.test(ua);
    var MENU3 = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
    if (standalone) {
      help.appendChild(h('p', { class: 'ih', text: '이미 홈 화면 앱으로 열려 있어요' }));
      help.appendChild(h('p', { class: 'src', text: '지금 화면이 홈 화면에 추가한 아이콘으로 연 앱이에요. 따로 추가하지 않아도 돼요.' }));
    } else if (inApp) {
      help.appendChild(h('p', { class: 'ih', text: inApp + ' 안에서 열었어요' }));
      help.appendChild(h('ol', { class: 'steps' }, [
        step(1, ICON.menu, inApp + ' 화면의 메뉴(점 세 개, 보통 오른쪽 위나 아래)를 눌러요.'),
        step(2, ICON.share, '“다른 브라우저로 열기”(아이폰은 “사파리로 열기”)를 눌러요.'),
        step(3, ICON.add, '열린 브라우저에서 이 버튼을 다시 누르면 추가 방법이 나와요.')
      ]));
      help.appendChild(h('p', { class: 'src', text: inApp + ' 안의 브라우저에서는 홈 화면에 추가할 수 없어요.' }));
    } else if (ios) {
      help.appendChild(h('p', { class: 'ih', text: '아이폰·아이패드 (사파리)' }));
      help.appendChild(h('ol', { class: 'steps' }, [
        step(1, ICON.share, '화면 아래쪽 가운데 공유 버튼을 눌러요.'),
        step(2, ICON.add, '목록을 조금 올려 “홈 화면에 추가”를 눌러요.'),
        step(3, ICON.check, '오른쪽 위 “추가”를 누르면 홈 화면에 아이콘이 생겨요.')
      ]));
    } else if (samsung) {
      help.appendChild(h('p', { class: 'ih', text: '삼성 인터넷' }));
      help.appendChild(h('ol', { class: 'steps' }, [
        step(1, MENU3, '화면 아래쪽 오른쪽 메뉴(줄 세 개)를 눌러요. 아래 막대가 안 보이면 화면을 살짝 위로 올려 보세요.'),
        step(2, ICON.add, '“현재 페이지 추가”를 누른 뒤 “홈 화면”을 골라요.'),
        step(3, ICON.check, '“추가”를 누르면 홈 화면에 아이콘이 생겨요.')
      ]));
    } else {
      help.appendChild(h('p', { class: 'ih', text: '안드로이드 휴대폰·PC (크롬)' }));
      help.appendChild(h('ol', { class: 'steps' }, [
        step(1, ICON.menu, '주소창 오른쪽 점 세 개 메뉴를 눌러요. 주소창이 안 보이면 화면을 살짝 아래로 내려 보세요.'),
        step(2, ICON.add, '“홈 화면에 추가” 또는 “앱 설치”를 눌러요.'),
        step(3, ICON.check, '“추가” 또는 “설치”를 누르면 아이콘이 생겨요.')
      ]));
      help.appendChild(h('p', { class: 'src', text: '메뉴 위치는 브라우저마다 달라요. 삼성 인터넷은 화면 아래쪽 메뉴(줄 세 개) → “현재 페이지 추가” → “홈 화면”이에요.' }));
    }
    help.hidden = false; btn.setAttribute('aria-expanded', 'true');
  });

  // ── 시작 ──
  $('dict-date').textContent = window.DICT_DATE || '';
  $('dict-count').textContent = String(WORDS.length);
  if ($('browse-total')) $('browse-total').textContent = String(WORDS.length);
  if ($('browse-paper')) $('browse-paper').textContent = String(WORDS.filter(function (w) { return w.src === 'paper'; }).length);
  renderRecent();
  renderBrowse();
  try {
    var q0 = new URLSearchParams(location.search).get('q');
    if (q0) runFind(q0.slice(0, 200));
    else if (VIEWS[location.hash.slice(1)]) goView(location.hash.slice(1), false);
    else markNav('home');
  } catch (e) { /* 무시 */ }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
