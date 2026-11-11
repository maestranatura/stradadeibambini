"""Funzioni di testo condivise da costruisci_indice.py (indice pubblico) e
costruisci_corpus.py (base privata della fase 2)."""
import re
from pathlib import Path

MAX = 900  # caratteri per passo

def clean(s):
    if not s: return ''
    s = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', str(s))   # [[url|testo]] -> testo
    s = re.sub(r'\[([^\]]+)\]\((?:[^)]+)\)', r'\1', s)              # [testo](url)
    s = re.sub(r'https?://\S+', '', s)
    s = s.replace('**', '').replace('*', '')
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n{2,}', '\n', s)
    return s.strip()

def split(text, max_len=MAX):
    """Divide in pezzi di paragrafi interi (mai frasi tagliate a metà se evitabile)."""
    paras = [p.strip() for p in re.split(r'\n+', text) if p.strip()]
    out, cur = [], ''
    for p in paras:
        if len(p) > max_len:  # paragrafo lungo: per frasi
            for s in re.split(r'(?<=[.!?»])\s+', p):
                if cur and len(cur) + len(s) + 1 > max_len: out.append(cur); cur = ''
                cur = (cur + ' ' + s).strip()
            continue
        if cur and len(cur) + len(p) + 1 > max_len: out.append(cur); cur = ''
        cur = (cur + '\n' + p).strip()
    if cur: out.append(cur)
    return out

def metodo_chunks(path):
    L = Path(path).read_text().split('\n')
    def left(l):
        m = re.search(r'\S(\s{12,})\S', l)
        if m and m.start(1) > 30: return l[:m.start(1) + 1].rstrip()
        if re.match(r'^\s{40,}', l): return ''
        return l.rstrip()
    pages, cur = [], []
    for l in L:
        if l.startswith('Mappe Genius Loci'):
            pages.append(cur); cur = []; continue
        if re.fullmatch(r'\s+(\d{2}|[IVX]+)\s*', l) and any(x.strip() for x in cur):
            pages.append(cur); cur = []
        cur.append(left(l))
    pages.append(cur)
    out = []
    for pg in pages[1:]:
        lines = [x for x in pg]
        nonempty = [x.strip() for x in lines if x.strip()]
        if not nonempty: continue
        num = ''
        if re.fullmatch(r'(\d{2}|[IVX]+)', nonempty[0]): num = nonempty.pop(0)
        if not nonempty: continue
        title = nonempty.pop(0)
        sub = ''
        if nonempty and len(nonempty[0]) <= 110 and re.search(r'[.»?!]$', nonempty[0]) and not nonempty[0].startswith('Fonti:'):
            sub = nonempty.pop(0)
        if title in ('Il survey in sintesi', 'Riferimenti') or title.startswith('▪'): continue
        if not sub and len(title) > 60: continue  # pagina-immagine senza titolo vero
        # prosa: unisci righe in paragrafi, scarta Fonti e righe da diagramma
        body, fonti, para = [], '', []
        started = False
        for x in lines:
            s = x.strip()
            if s in (num, title, sub) and not started: continue
            if s.startswith('Fonti:'): fonti = s; break
            if s.startswith('▪'): continue
            if not s:
                if para and re.search(r'[.!?»]$', para[-1]): body.append(' '.join(para)); para = []
                continue
            if len(s) < 25 and not para: continue
            started = True
            if para and len(para[-1]) > 60 and not re.search(r'[.!?»:;]$', para[-1]) and s[:1].islower():
                para.append(s)
            elif para and not re.search(r'[.!?»]$', para[-1]):
                para.append(s)
            else:
                if para: body.append(' '.join(para)); para = []
                para.append(s)
        if para: body.append(' '.join(para))
        text = '\n'.join(b for b in body if len(b) > 40)
        text = re.sub(r'(\w)- (\w)', r'\1\2', text)
        if len(text) < 150: continue
        out.append((f"{num} · {title}" if re.fullmatch(r'\d{2}', num) else title, sub, text, fonti))
    return out


def estratto_breve(text, lung=260):
    """Prime frasi intere del testo, entro `lung` caratteri (per l'indice pubblico)."""
    t = ' '.join(text.split())
    out = ''
    for s in re.split(r'(?<=[.!?»])\s+', t):
        if out and len(out) + len(s) + 1 > lung: break
        out = (out + ' ' + s).strip()
        if len(out) >= lung * 0.6: break
    if len(out) > lung:
        cut = out.rfind(' ', 0, lung)
        out = out[:cut if cut > 100 else lung].rstrip(' ,;:') + ' …'
    return out
