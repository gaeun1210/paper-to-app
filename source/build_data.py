"""words.tsv, paper_fake_words.tsv, common_words.txt 로 ../data.js 를 만든다.

실행: source 폴더에서  python build_data.py
"""
import csv, datetime, json, re, sys, os

here = os.path.dirname(os.path.abspath(__file__))
rows = list(csv.DictReader(open(os.path.join(here, 'words.tsv'), encoding='utf-8'), delimiter='\t'))
words = []
seen = set()
for r in rows:
    w = r['낱말'].strip()
    if not w or w in seen:
        continue
    seen.add(w)
    words.append({
        'w': w, 'full': r['원말'].strip(), 'm': r['뜻'].strip(), 'e': r['예문'].strip(),
        'src': 'paper' if r['출처'].strip() == '논문 대조군' else 'app',
        'note': (r.get('주의') or '').strip(),
        'cat': (r.get('분류') or '').strip(),
    })

txt = open(os.path.join(here, 'common_words.txt'), encoding='utf-8').read()
txt = '\n'.join(l for l in txt.splitlines() if not l.startswith('#'))
txt += '\n' + '\n'.join(w['w'] + w['full'] + w['m'] + w['e'] for w in words)
common = ''.join(sorted(set(re.findall('[가-힣]', txt))))

fakes = []
for r in csv.DictReader(open(os.path.join(here, 'paper_fake_words.tsv'), encoding='utf-8'), delimiter='\t'):
    w = r['낱말'].strip()
    if not w:
        continue
    e = r['단정수'].strip()
    fakes.append({'w': w, 'type': r['유형'].strip(), 'study': int(r['연구']), 'made': r['만든뜻'].strip(),
                  'e': int(e) if e else None})

out = os.path.join(here, '..', 'data.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write('// 자동 생성 파일 (build_data.py). 직접 고치지 말고 words.tsv 를 고치세요.\n')
    f.write('window.DICT_DATE = "' + datetime.date.today().isoformat() + '";\n')
    f.write('window.WORDS = ' + json.dumps(words, ensure_ascii=False, indent=0) + ';\n')
    f.write('window.COMMON = ' + json.dumps(common, ensure_ascii=False) + ';\n')
    f.write('// 논문(연구 1·2)에서 만든 가짜 단어 70개. e = 세 AI·두 질문 6건 중 뜻을 단정한 수 (논문에 단어별 값이 없으면 null)\n')
    f.write('window.PAPER_FAKES = ' + json.dumps(fakes, ensure_ascii=False) + ';\n')
print(len(words), 'words,', len(fakes), 'paper fakes,', len(common), 'common syllables ->', out)
