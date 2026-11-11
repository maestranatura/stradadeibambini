#!/usr/bin/env python3
"""Testi ufficiali delle Indicazioni nazionali per la base privata del Genius Loci (tipo_base «contenuti»).

Scarica (se mancano) i PDF ufficiali in DIR/normativa/, ne estrae il testo con pdftotext -layout,
lo pulisce (intestazioni, numeri di pagina, a capo con trattino) e lo divide in passi per versione,
ordine di scuola, classe, disciplina o campo di esperienza e sezione (premessa, traguardi/competenze
attese, obiettivi, conoscenze). Competenze, traguardi e obiettivi restano PAROLA PER PAROLA:
si tolgono solo gli a capo e i numeri di pagina.

Uscita: DIR/normativa/passi-normativa.json (in chiaro, solo nella cartella privata). Lo legge
costruisci_corpus.py (documenti del manifest con «sorgente»: «passi»).

Uso: python3 genius-loci/strumenti/normativa.py --privato /workspace/genius-loci-privato
"""
import argparse, json, re, subprocess, unicodedata, urllib.request
from pathlib import Path

UA = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36'
DOCUMENTI = {
    '2012': {
        'file': 'in2012.pdf', 'url': 'https://www.mim.gov.it/documents/20182/51310/DM+254_2012.pdf',
        'titolo': 'Indicazioni nazionali 2012 per il curricolo della scuola dell’infanzia e del primo ciclo',
        'decreto': 'DM 16 novembre 2012, n. 254 (GU n. 30 del 5 febbraio 2013)', 'autore': 'MIUR',
        'salta_fino': r'^CULTURA SCUOLA PERSONA$',
        'blocchi': [
            (r'^CULTURA SCUOLA PERSONA$', 'Cultura scuola persona', 'generale', None),
            (r'^FINALITÀ GENERALI$', 'Finalità generali e profilo dello studente', 'generale', None),
            (r'^L’ORGANIZZAZIONE DEL CURRICOLO$', 'L’organizzazione del curricolo', 'generale', None),
            (r'^LA SCUOLA DELL’INFANZIA$', 'La scuola dell’infanzia', 'generale', 'infanzia'),
            (r'^IL SÉ E L’ALTRO$', 'Il sé e l’altro', 'campo di esperienza', 'infanzia'),
            (r'^IL CORPO E IL MOVIMENTO$', 'Il corpo e il movimento', 'campo di esperienza', 'infanzia'),
            (r'^IMMAGINI, SUONI, COLORI$', 'Immagini, suoni, colori', 'campo di esperienza', 'infanzia'),
            (r'^I DISCORSI E LE PAROLE$', 'I discorsi e le parole', 'campo di esperienza', 'infanzia'),
            (r'^LA CONOSCENZA DEL MONDO$', 'La conoscenza del mondo', 'campo di esperienza', 'infanzia'),
            (r'^Dalla scuola dell’infanzia alla scuola primaria$', 'Dalla scuola dell’infanzia alla scuola primaria', 'generale', 'infanzia'),
            (r'^LA SCUOLA DEL PRIMO CICLO$', 'La scuola del primo ciclo', 'generale', None),
            (r'^ITALIANO$', 'Italiano', 'italiano', None),
            (r'^LINGUA INGLESE E SECONDA LINGUA COMUNITARIA$', 'Lingua inglese e seconda lingua comunitaria', 'inglese', None),
            (r'^STORIA$', 'Storia', 'storia', None),
            (r'^GEOGRAFIA$', 'Geografia', 'geografia', None),
            (r'^MATEMATICA$', 'Matematica', 'matematica', None),
            (r'^SCIENZE$', 'Scienze', 'scienze', None),
            (r'^MUSICA$', 'Musica', 'musica', None),
            (r'^ARTE E IMMAGINE$', 'Arte e immagine', 'arte', None),
            (r'^EDUCAZIONE FISICA$', 'Educazione fisica', 'educazione motoria', None),
            (r'^TECNOLOGIA$', 'Tecnologia', 'tecnologia', None),
        ]},
    '2018': {
        'file': 'scenari2018.pdf', 'url': 'https://www.mim.gov.it/documents/20182/0/Indicazioni+nazionali+e+nuovi+scenari/3234ab16-1f1d-4f34-99a3-319d892a40f2',
        'titolo': 'Indicazioni nazionali e nuovi scenari (2018)', 'versione': '2012',
        'decreto': 'documento del Comitato scientifico nazionale, nota MIUR prot. 3645 del 1° marzo 2018 (non è un decreto)', 'autore': 'MIUR, Comitato scientifico nazionale',
        'salta_fino': r'^1\. I nuovi scenari$', 'occorrenza_inizio': 2,
        'blocchi': [(r'^1\. I nuovi scenari$', 'Nuovi scenari', 'generale', None)]},
    '2025': {
        'file': 'in2025.pdf', 'url': 'https://www.mim.gov.it/documents/8099600/10323273/01_Indicazioni+Nazionali.pdf/ab117afe-84b8-5e06-0904-0e04693cf015',
        'titolo': 'Indicazioni nazionali 2025 per il curricolo della scuola dell’infanzia e del primo ciclo',
        'decreto': 'DM 9 dicembre 2025, n. 221 (GU n. 21 del 27 gennaio 2026)', 'autore': 'MIM',
        'blocchi': [
            (r'^Regolamento recante indicazioni nazionali', 'Decreto 9 dicembre 2025, n. 221 (articoli)', 'generale', None),
            (r'^Sommario$', None, None, None),       # sommario: fuori
            (r'^Commissione$', None, None, None),  # elenco dei componenti: non serve al recupero
            (r'^Premesse culturali alle Indicazioni Nazionali per il curricolo$', 'Premesse culturali', 'generale', None),
            (r'^Finalità della scuola dell’infanzia e delle scuole del$', 'Finalità della scuola dell’infanzia e del primo ciclo', 'generale', None),
            (r'^Profilo dello studente$', 'Profilo dello studente', 'generale', None),
            (r'^Obiettivi generali del processo formativo$', 'Obiettivi generali del processo formativo', 'generale', None),
            (r'^L’organizzazione del curricolo di scuola$', 'L’organizzazione del curricolo di scuola', 'generale', None),
            (r'^Indicazioni nazionali per la scuola dell’infanzia$', 'La scuola dell’infanzia', 'generale', 'infanzia'),
            (r'^Campo di esperienza - Il sé e l’altro$', 'Il sé e l’altro', 'campo di esperienza', 'infanzia'),
            (r'^Campo di esperienza - Il corpo e il movimento$', 'Il corpo e il movimento', 'campo di esperienza', 'infanzia'),
            (r'^Campo di esperienza - Immagini, suoni, colori$', 'Immagini, suoni, colori', 'campo di esperienza', 'infanzia'),
            (r'^Campo di esperienza - I discorsi e le parole$', 'I discorsi e le parole', 'campo di esperienza', 'infanzia'),
            (r'^Campo di esperienza - La conoscenza del mondo$', 'La conoscenza del mondo', 'campo di esperienza', 'infanzia'),
            (r'^Dalla scuola dell’infanzia alla scuola primaria$', 'Dalla scuola dell’infanzia alla scuola primaria', 'generale', 'infanzia'),
            (r'^Indicazioni nazionali per le scuole del primo ciclo di$', 'Le scuole del primo ciclo', 'generale', None),
            (r'^Italiano \(lingua e letteratura\)$', 'Italiano', 'italiano', None),
            (r'^Latino per l’educazione linguistica \(LEL\)$', 'Latino per l’educazione linguistica', 'latino', 'secondaria'),
            (r'^Lingua inglese$', 'Lingua inglese', 'inglese', None),
            (r'^Seconda lingua comunitaria$', 'Seconda lingua comunitaria', 'seconda lingua', 'secondaria'),
            (r'^Storia$', 'Storia', 'storia', None),
            (r'^Geografia$', 'Geografia', 'geografia', None),
            (r'^Educazione integrata matematico-scientifico-tecnologica \(STEM\)$', 'Educazione integrata STEM', 'stem', None),
            (r'^Matematica$', 'Matematica', 'matematica', None),
            (r'^Scienze$', 'Scienze', 'scienze', None),
            (r'^Tecnologia$', 'Tecnologia', 'tecnologia', None),
            (r'^Musica$', 'Musica', 'musica', None),
            (r'^Strumento musicale$', 'Strumento musicale', 'strumento musicale', 'secondaria'),
            (r'^Arte e immagine$', 'Arte e immagine', 'arte', None),
            (r'^Educazione motoria e fisica$', 'Educazione motoria e fisica', 'educazione motoria', None),
        ]},
    'nota1312': {
        'file': 'nota1312.pdf', 'url': 'https://www.mim.gov.it/documents/7673905/10323025/AOODPIT.REGISTRO+UFFICIALE.2026.0001312.pdf/',
        'titolo': 'Nota MIM prot. 1312 del 12 marzo 2026 (decorrenze delle Indicazioni 2025)', 'versione': '2025',
        'decreto': 'nota MIM prot. n. 1312 del 12 marzo 2026 sul DM 221/2025', 'autore': 'MIM',
        'includi_inizio': True,
        'blocchi': [(r'^Come è noto, con decreto ministeriale', 'Decorrenze e adempimenti', 'generale', None)]},
}
INTESTAZIONI = re.compile(r'^(Indicazioni nazionali per il curricolo della scuola dell’infanzia e del primo ciclo d’istruzione|'
                          r'Ministero dell’istruzione e del merito|Dipartimento per il sistema educativo di istruzione e formazione|'
                          r'Indicazioni Nazionali e Nuovi Scenari|m_pi\.AOODPIT.*|_+|UFFICIALE\.U\..*)$')
TITOLO_SEZ = re.compile(r'(?i:^(?=traguardi|competenze attese|obiettivi|conoscenze|scuola))^(Traguardi (per lo sviluppo|di sviluppo) dell[ae] competenz[ae].*|Competenze attese.*|'
                        r'Obiettivi( specifici)?( di apprendimento)?( al termine.*| \(.*)?|Conoscenze|Scuola primaria|Scuola secondaria di primo grado)$', re.I)

def scarica(dir_, d):
    f = dir_ / d['file']
    if not f.exists():
        req = urllib.request.Request(d['url'], headers={'User-Agent': UA})
        f.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    return f

def righe_pulite(pdf):
    t = subprocess.run(['pdftotext', '-q', '-layout', str(pdf), '-'], capture_output=True, text=True).stdout
    t = unicodedata.normalize('NFC', t).replace('\u0300', '').replace('\u00ad', '')  # «realtà̀» → «realtà»
    out = []
    for r in t.replace('\f', '\n').split('\n'):
        r = re.sub(r'\s{3,}\d{1,3}\s*$', '', r)          # numero di pagina sul margine destro
        r = re.sub(r'^\s*\d{1,3}\s{3,}(?=\S)', '', r)    # numero di pagina sul margine sinistro
        s = r.strip()
        if re.fullmatch(r'\d{1,3}', s) or INTESTAZIONI.match(s): s = ''
        out.append(s)
    return out

def vocabolario(righe):
    """Parole intere del documento (senza i pezzi di parola spezzati a fine riga)."""
    v, prec = set(), ''
    for r in righe:
        ws = re.findall(r"[\wà-ÿ]+(?:-[\wà-ÿ]+)*-?", r.lower())
        if ws and re.search(r'[\wà-ÿ]-$', prec): ws = ws[1:]
        v.update(w for w in ws if not w.endswith('-'))
        if r: prec = r
    return v

TRATTINI = []  # trattini mantenuti (per il controllo)
def unisci_trattino(a, b, voc):
    """a finisce con «parola-», b comincia in minuscolo: a capo tipografico o trattino vero?"""
    m1 = re.search(r'([\wà-ÿ]+)-$', a); m2 = re.match(r'([\wà-ÿ]+)', b)
    w1, w2 = m1.group(1).lower(), m2.group(1).lower()
    if (w1 + w2) in voc: return a[:-1] + b
    if f'{w1}-{w2}' in voc or (w1.endswith('ico') and w2 in voc and len(w2) >= 5):  # politico-partitico
        TRATTINI.append(f'{w1}-{w2}'); return a + b
    return a[:-1] + b

def paragrafi(righe, voc):
    """Righe → paragrafi (voci di elenco e titoletti separati)."""
    par = []
    for i, s in enumerate(righe):
        if not s:
            if par and par[-1] and re.search(r'[.;:!?»)]$', par[-1]): par.append('')
            continue
        succ = next((x for x in righe[i + 1:] if x), '')
        titoletto = len(s) < 60 and s[:1].isupper() and not re.search(r'[.;:,!?]$', s) and re.match(r'^[–\-•]', succ)
        nuovo = (not par or not par[-1] or re.match(r'^[–\-•]\s', s) or titoletto or TITOLO_SEZ.match(s)
                 or (re.search(r'([.;:!?»]|\.\))$', par[-1]) and (s[:1].isupper() or s[:1] in '«“"('))
                 or par[-1].endswith('§'))
        if nuovo:
            par.append(s + ('§' if titoletto or TITOLO_SEZ.match(s) else ''))
        else:
            prec = par[-1]
            par[-1] = unisci_trattino(prec, s, voc) if re.search(r'[\wà-ÿ]-$', prec) and s[:1].islower() else prec + ' ' + s
    return [re.sub(r'\s+', ' ', p).strip() for p in par if p.strip()]

def classe_da(titolo, ordine):
    t = titolo.lower()
    if 'secondaria' in t: ordine = 'secondaria'
    elif 'primaria' in t: ordine = 'primaria'
    n = '5' if 'quinta' in t else '3' if 'terza' in t else None
    if 'al termine della scuola primaria' in t: n = '5'
    if 'al termine della scuola secondaria' in t: n = '3'
    return ordine, (f'{ordine} {n}' if ordine in ('primaria', 'secondaria') and n else ordine)

def tipo_sez(titolo):
    t = titolo.lower()
    if t.startswith(('traguardi', 'competenze attese')): return 'traguardi'
    if t.startswith('obiettivi'): return 'obiettivi'
    if t.startswith('conoscenze'): return 'conoscenze'
    return 'premessa'

def raggruppa(pars, max_len):
    """Passi di paragrafi interi; un titoletto («Orientamento§») resta con le voci che seguono."""
    out, cur = [], []
    for p in pars:
        lung = sum(len(x) + 1 for x in cur)
        if cur and (lung + len(p) > max_len or (p.endswith('§') and lung > max_len * 0.55)):
            out.append(cur); cur = []
        cur.append(p)
    if cur: out.append(cur)
    return ['\n'.join(x.rstrip('§') for x in c) for c in out]

def slug(s): return re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', s.lower()).encode('ascii', 'ignore').decode()).strip('-')

def costruisci(dir_):
    passi = []
    for chiave, d in DOCUMENTI.items():
        righe = righe_pulite(scarica(dir_, d))
        voc = vocabolario(righe)
        versione = d.get('versione', chiave)
        # inizio dei blocchi (la prima riga che corrisponde dopo il blocco precedente, saltando il sommario)
        inizi, da = [], 0
        for rx, titolo, disc, ordine in d['blocchi']:
            occ = d.get('occorrenza_inizio', 1) if not inizi else 1
            trov = None
            for i in range(da, len(righe)):
                if re.search(rx, righe[i]) and '....' not in righe[i]:
                    occ -= 1
                    if occ == 0: trov = i; break
            if trov is None: raise SystemExit(f'{chiave}: non trovo il blocco {rx}')
            inizi.append((trov, titolo, disc, ordine)); da = trov + 1
        for k, (ini, titolo, disc, ordine0) in enumerate(inizi):
            if titolo is None: continue
            fine = inizi[k + 1][0] if k + 1 < len(inizi) else len(righe)
            corpo = righe[ini + (0 if d.get('includi_inizio') else 1):fine]
            ordine = ordine0
            sez, sez_tit, buf = 'premessa', 'Premessa', []
            def chiudi():
                pars = paragrafi(buf, voc)
                if not pars: return
                ordine_s, classe = (ordine, ordine) if sez == 'premessa' else classe_da(sez_tit, ordine)
                if disc == 'campo di esperienza': ordine_s, classe = 'infanzia', 'infanzia'
                for testo in raggruppa(pars, 1600 if sez != 'premessa' else 900):
                    if len(testo) < 40: continue
                    p = {'tipo': 'normativa', 'tipo_fonte': 'normativa', 'tipo_base': 'contenuti',
                         'ref': f'indicazioni-{chiave}:{slug(titolo)}',
                         'titolo': f"{'Indicazioni nazionali ' + versione if chiave in ('2012', '2025') else d['titolo']} · {titolo}",
                         'autore': d['autore'], 'versione': versione, 'decreto': d['decreto'], 'url': d['url'],
                         'disciplina': titolo if disc == 'campo di esperienza' else (disc if disc != 'generale' else None),
                         'campo_esperienza': titolo if disc == 'campo di esperienza' else None,
                         'ordine': ordine_s, 'classe': classe, 'sezione_tipo': sez,
                         'sezione': (sez_tit if sez != 'premessa' else titolo)[:120], 'testo': testo,
                         'fonte': f"{d['titolo']} — {d['decreto']}"}
                    passi.append({k2: v for k2, v in p.items() if v not in (None, '')})
            for s in corpo:
                if TITOLO_SEZ.match(s) and disc != 'generale' and not (disc == 'generale'):
                    if s in ('Scuola primaria', 'Scuola secondaria di primo grado'):
                        chiudi(); buf = []; ordine = 'primaria' if s == 'Scuola primaria' else 'secondaria'
                        sez, sez_tit = 'premessa', 'Premessa'; continue
                    chiudi(); buf = []
                    sez, sez_tit = tipo_sez(s), s
                    continue
                if sez != 'premessa' and buf and re.match(r'^(della scuola|di primo grado|la seconda lingua|scuola primaria|n\. 176)', s) and not any(buf):
                    sez_tit += ' ' + s; continue
                buf.append(s)
            chiudi()
    for i, p in enumerate(passi): p['id'] = f'n{i}'
    return passi

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--privato', required=True, type=Path)
    a = ap.parse_args()
    dir_ = a.privato / 'normativa'; dir_.mkdir(exist_ok=True)
    passi = costruisci(dir_)
    (dir_ / 'passi-normativa.json').write_text(json.dumps({'versione': 1, 'passi': passi}, ensure_ascii=False, indent=0))
    from collections import Counter
    print(len(passi), 'passi ·', dict(Counter((p['versione'], p['sezione_tipo']) for p in passi)),
          f"· {sum(len(p['testo']) for p in passi) / 1024:.0f} KB di testo")

if __name__ == '__main__':
    main()
