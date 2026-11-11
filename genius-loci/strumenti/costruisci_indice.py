#!/usr/bin/env python3
"""Costruisce genius-loci/indice.json: i passi che «Parla con il Genius Loci» può citare.

Uso (dalla radice del repo):
    python3 genius-loci/strumenti/costruisci_indice.py [--metodo /percorso/metodo.txt]

Fonti:
  - esperienze.json  (UDA: descrizione, scheda, movimenti, voci VERIFICATE, lettura, replicare)
  - luoghi.geojson   (aule con un testo proprio)
  - metodo.txt       (Mappe Genius Loci: qui solo un estratto breve per capitolo; il testo
                      completo va nella base privata, vedi costruisci_corpus.py)

Regole: si indicizza solo testo già presente nelle fonti (contenuti del sito + estratti brevi del metodo); le voci dei bambini entrano solo se
`verificata` è vera e la scheda non ha `voci_in_verifica`; nessun testo viene riscritto.
"""
import argparse, json, re, sys, unicodedata
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from testi import clean, split, metodo_chunks, estratto_breve  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'genius-loci' / 'indice.json'

def comunita_breve(c):
    if not c: return ''
    if c.startswith('Salento'): return 'Salento'
    return c

passi = []
def add(**kw):
    kw['testo'] = clean(kw.get('testo'))
    if len(kw['testo']) < 25: return
    kw['id'] = f"p{len(passi)}"
    passi.append({k: v for k, v in kw.items() if v not in (None, '', [])})

# ---------- UDA ----------
esperienze = json.loads((ROOT / 'esperienze.json').read_text())
schede = []
for e in esperienze:
    base = dict(tipo='uda', ref=e['id'], titolo=e['titolo'], comunita=comunita_breve(e['community']),
                stato=e.get('stato'), eta=e.get('eta') or [], discipline=e.get('discipline') or [],
                aula=e.get('aula'), aula_id=e.get('aula_id'), luogo=e.get('percorso'))
    schede.append({**{k: base[k] for k in ('ref','titolo','comunita','stato','eta','discipline','aula','aula_id','luogo')},
                   'sottotitolo': e.get('sottotitolo'), 'codice': e.get('codice'),
                   'voci_in_verifica': bool(e.get('voci_in_verifica'))})
    head = ' · '.join(x for x in [e.get('sottotitolo'), e.get('aula'), e.get('percorso')] if x)
    add(**base, sezione='In breve', testo=(e.get('descrizione') or '') + ('\n' + head if head else ''))
    su = e.get('uda_sintesi') or e.get('scheda_uda') or {}
    if su:
        bits = []
        for k, lab in (('quando','Quando'),('dove','Dove'),('chi','Chi'),('tipologia','Tipologia'),('prodotto','Prodotto'),('prodotto_finale','Prodotto finale')):
            v = su.get(k)
            if isinstance(v, list): v = '; '.join(map(str, v))
            if v: bits.append(f'{lab}: {v}')
        d = su.get('discipline')
        if isinstance(d, list): d = ', '.join(d)
        if d: bits.append(f'Discipline: {d}')
        add(**base, sezione='L’UDA in sintesi', testo='\n'.join(bits))
    prog = e.get('progettazione') or {}
    dg = (prog.get('domanda_generativa') or {})
    if isinstance(dg, dict) and dg.get('testo'):
        add(**base, sezione='Domanda generativa', testo=dg['testo'] + (f" ({dg['stato']})" if dg.get('stato') else ''))
    movs = e.get('movimenti') or []
    if movs:
        for m in movs:
            for i, chunk in enumerate(split(clean(m.get('testo')))):
                add(**base, sezione=m.get('titolo') or 'Racconto', testo=chunk, fonte=m.get('fonte'))
    elif e.get('racconto'):
        for chunk in split(clean(e['racconto'])):
            add(**base, sezione='Racconto', testo=chunk)
    if e.get('estratto_scheda'):
        for chunk in split(clean(e['estratto_scheda'] if isinstance(e['estratto_scheda'], str) else json.dumps(e['estratto_scheda'], ensure_ascii=False))):
            add(**base, sezione='Dalla scheda', testo=chunk)
    # Voci: solo verificate, e mai se la scheda ha trascrizioni in verifica.
    if not e.get('voci_in_verifica'):
        seen = set()
        voci = list(e.get('voci') or [])
        for m in movs: voci += m.get('voci') or []
        for v in voci:
            t = (v.get('testo') or '').strip()
            if not t or t in seen or v.get('verificata') is not True: continue
            seen.add(t)
            add(**base, sezione='Voce dei bambini', voce=True, testo=t, fonte=v.get('fonte'), contesto=v.get('contesto'))
    lett = e.get('lettura') or {}
    lt = lett.get('testo') if isinstance(lett, dict) else None
    lt = lt or e.get('lettura_pedagogica')
    for chunk in split(clean(lt)):
        add(**base, sezione='Lettura pedagogica', testo=chunk)
    app = e.get('apparato') or {}
    if isinstance(app, dict) and app.get('replicare'):
        for chunk in split(clean(app['replicare'])):
            add(**base, sezione='Per replicare', testo=chunk)

# ---------- Aule ----------
PLACEHOLDER = 'il racconto di questo luogo è ancora da raccogliere'
feat = json.loads((ROOT / 'luoghi.geojson').read_text())['features']
uda_per_aula = {}
for e in esperienze:
    uda_per_aula.setdefault(e.get('aula_id'), []).append(e['id'])
aule = []
for f in feat:
    p = f['properties']
    if f['geometry']['type'] != 'Point': continue
    txt = clean(p.get('descrizione') or p.get('breve') or '')
    has_text = txt and PLACEHOLDER not in txt.lower()
    linked = uda_per_aula.get(p['id'], [])
    if not has_text and not linked: continue
    cat = p.get('categoria') or (p.get('tipo_aula') if p.get('tipo_aula') != 'Da classificare' else '')
    aule.append({'ref': p['id'], 'nome': p.get('name') or p.get('nome'), 'comunita': comunita_breve(p.get('community')),
                 'classi': p.get('classi'), 'categoria': cat, 'area': p.get('area') or p.get('percorso'),
                 'stato_uda': p.get('stato_uda'), 'uda': linked})
    extra = '\n'.join(x for x in [f"Categoria: {cat}" if cat else '', f"Classi: {p['classi']}" if p.get('classi') else '',
                                    f"Area: {p['area']}" if p.get('area') else ''] if x)
    add(tipo='aula', ref=p['id'], titolo=p.get('name') or p.get('nome'), comunita=comunita_breve(p.get('community')),
        classi=p.get('classi'), categoria=cat, luogo=p.get('area') or p.get('percorso'), aula_id=p['id'],
        sezione='Aula', testo=(txt if has_text else '') + '\n' + extra)

ap = argparse.ArgumentParser()
ap.add_argument('--metodo', default='/workspace/metodo.txt')
a = ap.parse_args()
n_met = 0
# Metodo: nell'indice PUBBLICO entra solo un estratto breve (prime frasi) per ogni capitolo.
# Il testo completo sta nella base privata della fase 2 (costruisci_corpus.py, cifrata).
if Path(a.metodo).exists():
    for title, sub, text, fonti in metodo_chunks(a.metodo):
        add(tipo='metodo', ref=re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', title.lower()).encode('ascii','ignore').decode()).strip('-'),
            titolo=title, sezione=sub or 'Mappe Genius Loci', testo=estratto_breve(text), estratto=True,
            fonte='Mappe Genius Loci (D. Casertano, A. Rossetto), estratto' + (' · ' + fonti[7:].strip() if fonti else ''))
        n_met += 1

OUT.write_text(json.dumps({'versione': 1, 'schede': schede, 'aule': aule, 'passi': passi},
                          ensure_ascii=False, separators=(',', ':')))
from collections import Counter
print(OUT, f'{OUT.stat().st_size/1024:.0f} KB', Counter(p['tipo'] for p in passi), 'voci', sum(1 for p in passi if p.get('voce')), 'aule', len(aule))
