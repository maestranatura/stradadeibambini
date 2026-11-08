"""Controlli statici riproducibili, senza dipendenze esterne o browser."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json,re,hashlib
ROOT=Path(__file__).resolve().parents[1]
class Doc(HTMLParser):
 def __init__(self,text):
  super().__init__(convert_charrefs=True);self.ids=set();self.links=[];self.lang=False;self.viewport=False;self.styles=[];self.in_style=False;self.feed(text)
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if a.get('id'):self.ids.add(a['id'])
  if tag=='html':self.lang=a.get('lang')=='it'
  if tag=='meta' and a.get('name')=='viewport':self.viewport=True
  for k in ['href','src']:
   if a.get(k):self.links.append(a[k])
files=[ROOT/'index.html',*sorted((ROOT/'siracusa').glob('*.html'))]
docs={p:Doc(p.read_text()) for p in files}
errors=[];checked=0
for p,doc in docs.items():
 if not doc.lang:errors.append(f'{p}: lingua italiana assente')
 if not doc.viewport:errors.append(f'{p}: viewport mobile assente')
 for href in doc.links:
  u=urlsplit(href)
  if u.scheme or u.netloc or href.startswith(('data:','mailto:','tel:','javascript:')):continue
  # Endpoint di piattaforma Netlify, non un asset del deploy (iniezione sul live).
  if u.path.startswith('/.netlify/'):continue
  dest=(ROOT/u.path.lstrip('/')) if u.path.startswith('/') else p.parent/u.path
  if not u.path:dest=p
  if dest.is_dir():dest=dest/'index.html'
  if not dest.is_file():errors.append(f'{p.relative_to(ROOT)}: manca {href}');continue
  if u.fragment and dest.suffix=='.html':
   target=docs.get(dest) or Doc(dest.read_text())
   if unquote(u.fragment) not in target.ids:errors.append(f'{p.relative_to(ROOT)}: ancora assente {href}')
  checked+=1
atlas=json.loads((ROOT/'siracusa/dati.json').read_text())
assert len(atlas['data'])==35
assert len({p['id'] for p in atlas['data']})==35
assert all(p['id'] in atlas['geo'] and p['id'] in atlas['locusTags'] for p in atlas['data'])
assert len(atlas['pilots'])==35
assert not list((ROOT/'siracusa').rglob('*.pdf'))
assert not list((ROOT/'siracusa').rglob('*.jpg'))
if errors:raise SystemExit('\n'.join(errors))
print(f'OK: {len(files)} pagine HTML, {checked} link/asset/ancore interni, 35 luoghi, 35 proposte, viewport mobile; nessun PDF di terzi.')
