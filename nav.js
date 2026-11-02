// 상단 메뉴: 휴대폰에서 펼치고 접기 + 논문 원문 링크(주소가 설정됐을 때만). 두 페이지가 함께 쓴다.
(function () {
  'use strict';
  var btn = document.getElementById('menu-btn'), nav = document.getElementById('nav');
  if (btn && nav) {
    function setOpen(on) { nav.classList.toggle('open', on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); btn.setAttribute('aria-label', on ? '메뉴 닫기' : '메뉴 열기'); }
    btn.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); btn.focus(); } });
  }
  var C = window.APP_CONFIG || {};
  var row = document.getElementById('paper-link-row'), a = document.getElementById('paper-link');
  if (row && a && C.paperUrl && /^https?:\/\//.test(C.paperUrl)) { a.href = C.paperUrl; row.hidden = false; }
})();

// 3-④ 논문 이야기: 화면에 보이면 막대가 차오르고 숫자가 올라간다.
// 스크립트가 없거나 움직임 줄이기를 켠 기기에서는 HTML에 적힌 최종 값 그대로 보인다.
(function () {
  'use strict';
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* 무시 */ }
  if (reduce || !('IntersectionObserver' in window)) return;
  var bars = Array.prototype.slice.call(document.querySelectorAll('.cbars'));
  var nums = Array.prototype.slice.call(document.querySelectorAll('.stat dd b'));
  if (!bars.length && !nums.length) return;
  bars.forEach(function (box) {
    Array.prototype.forEach.call(box.querySelectorAll('.cb-fill'), function (f) { f.setAttribute('data-w', f.style.width); f.style.width = '0%'; });
  });
  nums.forEach(function (b) { b.setAttribute('data-n', b.textContent); });
  function grow(box) {
    Array.prototype.forEach.call(box.querySelectorAll('.cb-fill'), function (f, i) {
      setTimeout(function () { f.style.width = f.getAttribute('data-w'); }, 80 * i);
    });
  }
  function count(b) {
    var end = parseInt(b.getAttribute('data-n'), 10); if (!(end > 0)) return;
    var t0 = null, dur = 900;
    function step(t) {
      if (t0 === null) t0 = t;
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      b.textContent = String(Math.round(end * e));
      if (k < 1) requestAnimationFrame(step); else b.textContent = b.getAttribute('data-n');
    }
    b.textContent = '0'; requestAnimationFrame(step);
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      if (en.target.classList.contains('cbars')) grow(en.target); else count(en.target);
    });
  }, { threshold: 0.35 });
  bars.concat(nums).forEach(function (el) { io.observe(el); });
})();
