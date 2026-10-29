"""把 tools/career_data.py 里的内容生成到 career.html 的时间线区域。"""
import html, re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from career_data import ERAS

def esc(t):  # 数据里已经写好的 &amp; 不重复转义
    return html.escape(t, quote=False).replace('&amp;amp;', '&amp;')

def item(date, title, paras, hi):
    dot = 'timeline-dot dot-highlight' if hi else 'timeline-dot'
    body = '\n'.join(f'              <p>{esc(p)}</p>' for p in paras)
    return f'''        <div class="timeline-item">
          <div class="{dot}"></div>
          <div class="timeline-date">{esc(date)}</div>
          <div class="timeline-card">
            <div class="timeline-card-header" onclick="this.parentElement.classList.toggle('open')">
              <h3>{esc(title)}</h3>
              <span class="timeline-arrow">&#9662;</span>
            </div>
            <div class="timeline-card-body">
{body}
            </div>
          </div>
        </div>
'''

tabs, panels = [], []
for i, (key, name, events) in enumerate(ERAS):
    tabs.append(f'      <button class="era-tab{" active" if i == 0 else ""}" data-era="{key}">{name}</button>')
    inner = '\n'.join(item(*e) for e in events)
    panels.append(f'''    <!-- === {name} === -->
    <div class="era-content{" active" if i == 0 else ""}" id="era-{key}">
      <div class="timeline">
        <div class="timeline-line"></div>

{inner}
      </div>
    </div>
''')

path = os.path.join(os.path.dirname(__file__), '..', 'career.html')
s = open(path, encoding='utf-8').read()
s = re.sub(r'(<div class="era-tabs-inner">\n).*?(\n    </div>\n  </div>)', lambda m: m.group(1) + '\n'.join(tabs) + m.group(2), s, count=1, flags=re.S)
s = re.sub(r'(<main class="timeline-container">\n).*?(\n  </main>)', lambda m: m.group(1) + '\n' + '\n'.join(panels) + m.group(2), s, count=1, flags=re.S)
open(path, 'w', encoding='utf-8').write(s)
print('events:', sum(len(e) for _, _, e in ERAS))
