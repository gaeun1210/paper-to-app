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
