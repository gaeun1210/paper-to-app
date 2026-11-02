// 논문 재현 자료(과제 10)의 연구자 분류로 "AI 답 점검"을 채점한 결과 (source/score_paper.js 로 만듦)
// 규칙은 연구 1(240건)만 보고 다듬었고, 연구 2(300건)는 다듬는 데 쓰지 않고 채점에만 썼다.
window.CHECKER_SCORE = {
  n: 300, e: 0.940, kappa: '0.86', set: '연구 2',
  fakeKappa: '0.72', five: 0.607,
  before: { e: 0.907, kappa: '0.78' },
  study1: { n: 240, e: 0.967, kappa: '0.93' },
  date: '2026-11-03'
};
