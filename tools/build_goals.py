# 生成进球档案数据 data/goals-data.js
# 数据参考 messivsronaldo.app 的逐球记录（按 985 口径，982 算他的头球）
# 用法：python3 tools/build_goals.py        他每进一个新球，重跑一次即可
import json, urllib.request, datetime, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from goals_zh import TEAM, COMP, ROUND, PERSON

URL = 'https://www.messivsronaldo.app/page-data/ronaldo-all-goals/page-data.json'
req = urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0'})
goals = json.load(urllib.request.urlopen(req, timeout=60))['result']['pageContext']['goals']
goals.sort(key=lambda g: g['number'])
assert [g['number'] for g in goals] == list(range(1, len(goals) + 1)), '球号不连续'

rows = []
for g in goals:
    rows.append([
        g['number'],
        f"{g['year']}-{g['month']}-{g['day']}",
        g['team'], g['opponent'],
        int(g['scoreTeam']), int(g['scoreOpponent']),
        g['competition'], g['round'] or '', g['homeAway'] or '',
        g['goalTime'] or '', g['type'] or '', g['where'] or '',
        g['assistedBy'] or '', g['videoLink'] or '',
        1 if g['matchWinner'] == 'gwg' else 0,
    ])

out = os.path.join(os.path.dirname(__file__), '..', 'data', 'goals-data.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write('// C罗职业生涯逐球记录。数据参考 messivsronaldo.app，由 tools/build_goals.py 生成，别手改\n')
    f.write('// 每行：[球号, 日期, 所属球队, 对手, 本方比分, 对方比分, 比赛, 轮次, 主客, 分钟, 部位, 方式, 助攻, 视频, 是否制胜球]\n')
    f.write('window.CR7_GOALS_UPDATED = ' + json.dumps(datetime.date.today().isoformat()) + ';\n')
    f.write('window.CR7_GOALS = ' + json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + ';\n')
    f.write('window.CR7_ZH = ' + json.dumps({'team': TEAM, 'comp': COMP, 'round': ROUND, 'person': PERSON}, ensure_ascii=False, separators=(',', ':')) + ';\n')
miss = sorted({r[2] for r in rows} | {r[3] for r in rows}) 
miss = [x for x in miss if x not in TEAM] + [x for x in sorted({r[6] for r in rows}) if x not in COMP] + [x for x in sorted({r[12] for r in rows if r[12]}) if x not in PERSON]
print('写好了', len(rows), '个球；没有中文名的：', miss or '无')
