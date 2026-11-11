#!/usr/bin/env python3
"""Costruisce la base di conoscenza PRIVATA della fase 2 di «Parla con il Genius Loci».

La base NON è pubblica: il repository è pubblico, quindi nel repo entra solo la versione
CIFRATA (AES-256-GCM) in netlify/genius-loci-dati/corpus.cifrato.json. La funzione Netlify la
decifra in memoria con la chiave della variabile d'ambiente GENIUS_LOCI_CORPUS_CHIAVE.
Senza chiave la funzione usa solo l'indice pubblico.

Cartella privata (fuori dal repo, mai pubblicata), per esempio /workspace/genius-loci-privato:
    manifest.json        elenco dei documenti con metadati e regole (vedi sotto)
    CHIAVE_CORPUS        chiave AES di 32 byte in base64 (creata con --nuova-chiave; chmod 600)
    sorgenti/<id>.<ext>  file scaricati da Google Drive (pdf, pptx, docx), nome = id Drive
    ocr/<id>.txt         testo letto con OCR dai PDF/PPTX fatti di sole immagini (--ocr)
    rielaborati/*.md     sintesi scritte con parole nostre (opere di terzi, libri di testo,
                         progetto Siracusa senza cifre), con intestazione di metadati
    metodo.txt           testo del PDF Mappe Genius Loci (pdftotext -layout)
    corpus.json          USCITA in chiaro, resta solo nella cartella privata

Uso (dalla radice del repo):
    python3 genius-loci/strumenti/costruisci_corpus.py --privato /workspace/genius-loci-privato [--ocr]
    python3 genius-loci/strumenti/costruisci_corpus.py --privato DIR --nuova-chiave   # solo la prima volta
    python3 genius-loci/strumenti/costruisci_corpus.py --privato DIR --ripristina     # rimette manifest e rielaborati dal backup cifrato

Scaricare i sorgenti: per ogni voce del manifest con drive_id, scaricare il file da Drive
(«Scarica», oppure lo strumento DownloadFile di Grok Bot) e salvarlo come sorgenti/<drive_id>.<ext>.
Lo script elenca i file mancanti.

Regole applicate:
  - testo completo solo per i materiali del team (tipo «team»); opere di terzi e libri di testo
    entrano SOLO come rielaborazioni (rielaborati/*.md), mai come testo originale;
  - via email, numeri di telefono, codici fiscali, link, righe con nomi di acquirenti (filigrane);
  - via le righe con budget, prezzi, preventivi, cifre in euro;
  - nomi da anonimizzare per documento (campo «anonimizza»);
  - Mappe Genius Loci / Mappe fondative: tolti i passi già presenti in metodo.txt (dedup_metodo);
  - nessuna immagine.
"""
import argparse, base64, json, os, re, secrets, subprocess, sys, unicodedata, zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from testi import clean, split, metodo_chunks  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
USCITA = ROOT / 'netlify' / 'genius-loci-dati' / 'corpus.cifrato.json'
BACKUP = ROOT / 'netlify' / 'genius-loci-dati' / 'sorgenti-private.cifrato.json'

# ---------------- estrazione testo ----------------
def estrai(path):
    path = Path(path)
    if path.suffix.lower() == '.pdf':
        return subprocess.run(['pdftotext', '-q', '-layout', str(path), '-'], capture_output=True, text=True, errors='ignore').stdout
    if path.suffix.lower() == '.pptx':
        from pptx import Presentation
        parts = []
        for i, s in enumerate(Presentation(path).slides, 1):
            seg = [sh.text_frame.text for sh in s.shapes if sh.has_text_frame and sh.text_frame.text.strip()]
            for sh in s.shapes:
                if getattr(sh, 'has_table', False) and sh.has_table:
                    for row in sh.table.rows: seg.append(' | '.join(c.text for c in row.cells))
            if s.has_notes_slide and s.notes_slide.notes_text_frame.text.strip():
                seg.append(s.notes_slide.notes_text_frame.text)
            parts.append(f'\n§SLIDE {i}\n' + '\n'.join(seg))
        return '\n'.join(parts)
    if path.suffix.lower() == '.docx':
        from docx import Document
        parts = []
        for el in Document(path).element.body.iterchildren():
            tag = el.tag.split('}')[1]
            if tag == 'p': parts.append(''.join(x.text or '' for x in el.iter() if x.tag.endswith('}t')))
            elif tag == 'tbl':
                for row in el.iter():
                    if row.tag.endswith('}tr'):
                        cells = [' '.join((x.text or '') for x in c.iter() if x.tag.endswith('}t')) for c in row.iter() if c.tag.endswith('}tc')]
                        parts.append(' | '.join(cells))
        return '\n'.join(parts)
    return path.read_text(errors='ignore')

def fai_ocr(src, dest):
    """OCR (rapidocr + pymupdf, 150 dpi) per PDF/PPTX fatti di immagini. Richiede:
    pip install rapidocr_onnxruntime pymupdf"""
    import io, zipfile, fitz
    from rapidocr_onnxruntime import RapidOCR
    eng = RapidOCR()
    def img(b):
        res, _ = eng(b)
        if not res: return ''
        res = sorted(res, key=lambda r: (round(r[0][0][1] / 15), r[0][0][0]))
        righe, cur, buf = [], None, []
        for box, txt, _sc in res:
            y = round(box[0][1] / 15)
            if cur is not None and y != cur: righe.append(' '.join(buf)); buf = []
            cur = y; buf.append(txt)
        if buf: righe.append(' '.join(buf))
        return '\n'.join(righe)
    src = Path(src); out = []
    if src.suffix.lower() == '.pdf':
        d = fitz.open(src)
        for p in range(len(d)): out.append(f'\n§PAGINA {p+1}\n' + img(d[p].get_pixmap(dpi=150).tobytes('png')))
    else:
        z = zipfile.ZipFile(src)
        media = sorted([n for n in z.namelist() if n.startswith('ppt/media/')], key=lambda s: int((re.findall(r'\d+', s) or ['0'])[-1]))
        for i, n in enumerate(media, 1): out.append(f'\n§SLIDE {i}\n' + img(z.read(n)))
    Path(dest).write_text('\n'.join(out))

# ---------------- privacy ----------------
RE_EMAIL = re.compile(r'[\w.+-]+@[\w-]+(\.[\w-]+)+')
RE_TEL = re.compile(r'(?<!\d)(\+39[\s.]?)?(3\d{2}[\s.]?\d{6,7}|0\d{1,3}[\s/.-]?\d{5,8})(?!\d)')
RE_CF = re.compile(r'\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b')
RE_URL = re.compile(r'(https?://|www\.)\S+')
RE_FILIGRANA = re.compile(r'^.*(Acquistato da|Numero Ordine|Questo quaderno è di).*$', re.M)
RE_SOLDI = re.compile(r'^.*(€|\bbudget\b|\bprezz[oi]\b|\bpreventiv[oi]\b|\bcost[oi] (indicativ|total)).*$', re.M | re.I)  # niente cifre economiche

def ripulisci(t, anonimizza=None):
    t = RE_FILIGRANA.sub('', t)
    t = RE_SOLDI.sub('', t)
    t = RE_EMAIL.sub('[email tolta]', t)
    t = RE_CF.sub('[codice tolto]', t)
    t = RE_URL.sub('', t)
    t = re.sub(r'\b[A-Z]?NotebookLM\b', '', t)  # filigrana delle slide generate
    t = RE_TEL.sub('[numero tolto]', t)
    for nome, sost in (anonimizza or {}).items():
        t = re.sub(r'\b' + re.escape(nome) + r'\b', sost, t)
    return t

def controllo_finale(passi, anonimizzati):
    problemi = []
    for p in passi:
        for rx, nome in ((RE_EMAIL, 'email'), (RE_CF, 'codice fiscale'), (RE_FILIGRANA, 'filigrana')):
            if rx.search(p['testo']): problemi.append((p['id'], nome))
        if RE_SOLDI.search(p['testo']): problemi.append((p['id'], 'cifre economiche'))
        for n in anonimizzati.get(p['ref'], ()):
            if re.search(r'\b' + re.escape(n) + r'\b', p['testo']): problemi.append((p['id'], 'nome ' + n))
    return problemi

# ---------------- dedup con metodo.txt ----------------
def tok(s): return re.findall(r'[a-zà-ù0-9]+', unicodedata.normalize('NFC', s.lower()))
def shingles(s, n=8):
    w = tok(s); return {' '.join(w[i:i+n]) for i in range(max(0, len(w) - n + 1))}

# ---------------- rielaborati ----------------
def leggi_md(path):
    t = Path(path).read_text()
    m = re.match(r'^---\n(.*?)\n---\n(.*)$', t, re.S)
    meta, corpo = {}, t
    if m:
        corpo = m.group(2)
        for riga in m.group(1).splitlines():
            if ':' in riga:
                k, v = riga.split(':', 1); meta[k.strip()] = v.strip()
    return meta, corpo

def lista(v):
    if not v: return []
    return [x.strip() for x in v.split(',')] if isinstance(v, str) else list(v)

# ---------------- cifratura ----------------
def cifra(dati_bytes, chiave):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    iv = secrets.token_bytes(12)
    ct = AESGCM(chiave).encrypt(iv, zlib.compress(dati_bytes, 9), None)  # ciphertext || tag (16 byte)
    return {'v': 1, 'alg': 'AES-256-GCM', 'compressione': 'zlib', 'iv': base64.b64encode(iv).decode(),
            'dati': base64.b64encode(ct).decode()}

def decifra(obj, chiave):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    return zlib.decompress(AESGCM(chiave).decrypt(base64.b64decode(obj['iv']), base64.b64decode(obj['dati']), None))

def leggi_chiave(priv):
    f = priv / 'CHIAVE_CORPUS'
    if not f.exists(): sys.exit('Manca CHIAVE_CORPUS: crearla con --nuova-chiave (e copiarla nella variabile GENIUS_LOCI_CORPUS_CHIAVE su Netlify).')
    k = base64.b64decode(f.read_text().strip())
    assert len(k) == 32
    return k

# ---------------- main ----------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--privato', required=True, type=Path)
    ap.add_argument('--ocr', action='store_true', help='rifà l’OCR dei documenti con sorgente «ocr» se manca ocr/<id>.txt')
    ap.add_argument('--nuova-chiave', action='store_true')
    ap.add_argument('--ripristina', action='store_true')
    a = ap.parse_args()
    priv = a.privato
    if a.nuova_chiave:
        f = priv / 'CHIAVE_CORPUS'
        if f.exists(): sys.exit('CHIAVE_CORPUS esiste già: non la sovrascrivo.')
        f.write_text(base64.b64encode(secrets.token_bytes(32)).decode() + '\n'); os.chmod(f, 0o600)
        print('Chiave creata in', f, '(non stampata). Copiarla nella variabile GENIUS_LOCI_CORPUS_CHIAVE.')
        return
    chiave = leggi_chiave(priv)
    if a.ripristina:
        arch = json.loads(decifra(json.loads(BACKUP.read_text()), chiave))
        for rel, txt in arch['file'].items():
            p = priv / rel; p.parent.mkdir(parents=True, exist_ok=True)
            if not p.exists(): p.write_text(txt); print('ripristinato', rel)
        return

    man = json.loads((priv / 'manifest.json').read_text())
    metodo_testo = ''
    passi, mancanti, anonimizzati, conteggi = [], [], {}, {}

    def add(doc, sezione, testo, motore='documento'):
        testo = clean(testo)
        if len(testo) < 40: return
        p = {'id': f'q{len(passi)}', 'tipo': motore, 'ref': doc['id'], 'titolo': doc['titolo'], 'autore': doc.get('autore'),
             'tipo_fonte': doc['tipo'], 'uso': doc.get('uso'), 'stato': doc.get('stato'), 'comunita': doc.get('comunita'),
             'eta': lista(doc.get('eta')), 'discipline': lista(doc.get('discipline')), 'classe': doc.get('classe'),
             'drive_id': doc.get('drive_id'), 'cartella_drive': doc.get('cartella'),
             'sezione': sezione[:120] if sezione else doc['titolo'], 'testo': testo,
             'fonte': f"{doc['titolo']} — {doc.get('autore') or ''}".strip(' —')}
        passi.append({k: v for k, v in p.items() if v not in (None, '', [])})
        conteggi[doc['id']] = conteggi.get(doc['id'], 0) + 1

    # 1) metodo completo
    for doc in man['documenti']:
        if doc['sorgente'] != 'metodo': continue
        f = priv / doc['file']
        if not f.exists(): mancanti.append(doc['file']); continue
        metodo_testo = f.read_text()
        for title, sub, text, fonti in metodo_chunks(f):
            for chunk in split(text):
                d2 = dict(doc, titolo=f"Mappe Genius Loci · {title}")
                add(d2, sub or title, chunk, motore='metodo')
                passi[-1]['ref'] = doc['id'] + ':' + re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', title.lower()).encode('ascii', 'ignore').decode()).strip('-')
                if fonti: passi[-1]['fonte'] += ' · ' + fonti[7:].strip()
    sh_metodo = shingles(metodo_testo)

    # 2) documenti del team (testo completo) e sintesi OCR
    for doc in man['documenti']:
        if doc['sorgente'] not in ('testo', 'ocr'): continue
        src = priv / doc['file']
        if doc['sorgente'] == 'ocr':
            o = priv / 'ocr' / f"{doc['drive_id']}.txt"
            if not o.exists() and a.ocr and src.exists(): o.parent.mkdir(exist_ok=True); fai_ocr(src, o)
            if not o.exists(): mancanti.append(str(o.relative_to(priv)) + ('' if src.exists() else f' (e {doc["file"]})')); continue
            raw = o.read_text()
        else:
            if not src.exists(): mancanti.append(doc['file']); continue
            raw = estrai(src)
        if doc.get('anonimizza'): anonimizzati[doc['id']] = list(doc['anonimizza'])
        raw = ripulisci(raw, doc.get('anonimizza'))
        # blocchi per slide/pagina
        blocchi = re.split(r'\n?§(?:SLIDE|PAGINA) \d+\n|\f?\[pagina \d+\]\n?|\f?## Slide(?:-immagine)? \d+\n', raw)
        tolti = 0
        for b in blocchi:
            righe = [r.strip() for r in b.splitlines() if r.strip()]
            if not righe: continue
            sezione = next((r for r in righe if 3 < len(r) < 90), righe[0][:90])
            for chunk in split(clean('\n'.join(righe))):
                if doc.get('dedup_metodo'):
                    s = shingles(chunk)
                    if s and len(s & sh_metodo) / len(s) > 0.5: tolti += 1; continue
                add(doc, sezione, chunk)
        if tolti: print(f"  {doc['id']}: {tolti} passi tolti perché già in metodo.txt")

    # 3) rielaborazioni (terzi, libri di testo, Siracusa senza cifre)
    for doc in man['documenti']:
        if doc['sorgente'] != 'rielaborato': continue
        f = priv / doc['file']
        if not f.exists(): mancanti.append(doc['file']); continue
        meta, corpo = leggi_md(f)
        d2 = dict(doc); d2.update({k: v for k, v in meta.items() if k in ('titolo', 'autore', 'tipo', 'uso', 'comunita', 'classe', 'eta', 'discipline', 'drive_id')})
        if meta.get('vissuta'): d2['stato'] = meta['vissuta']
        d2['tipo'] = d2.get('tipo') or 'rielaborato'
        if d2['tipo'] == 'libro di testo' and meta.get('eta'): d2['eta'] = [meta['eta']]
        elif meta.get('eta') == 'primaria': d2['eta'] = ['primaria I-II', 'primaria III-V']
        corpo = ripulisci(corpo)
        sezioni = re.split(r'^## ', corpo, flags=re.M)
        for s in sezioni:
            if not s.strip(): continue
            righe = s.strip().split('\n', 1)
            if s is sezioni[0] and not corpo.lstrip().startswith('## '): titolo_sez, testo = d2['titolo'], s
            else: titolo_sez, testo = righe[0].strip(), (righe[1] if len(righe) > 1 else '')
            for chunk in split(clean(testo)):
                add(d2, titolo_sez, chunk)
                if d2['tipo'] == 'libro di testo':
                    passi[-1]['discipline'] = [x.strip().lower() for x in re.split(r',| e |\s*/\s*', titolo_sez) if x.strip()][:4] or passi[-1].get('discipline')

    problemi = controllo_finale(passi, anonimizzati)
    if problemi:
        print('ATTENZIONE, controllo privacy:', problemi[:20])
        if any(n.startswith(('email', 'codice', 'filigrana', 'nome', 'cifre')) for _, n in problemi): sys.exit(1)

    corpus = {'versione': 1, 'passi': passi}
    (priv / 'corpus.json').write_text(json.dumps(corpus, ensure_ascii=False, indent=0))
    USCITA.parent.mkdir(parents=True, exist_ok=True)
    USCITA.write_text(json.dumps(cifra(json.dumps(corpus, ensure_ascii=False, separators=(',', ':')).encode(), chiave)))
    # backup cifrato degli input scritti a mano (manifest + rielaborati)
    arch = {'file': {'manifest.json': (priv / 'manifest.json').read_text()}}
    for f in sorted((priv / 'rielaborati').glob('*.md')): arch['file'][f'rielaborati/{f.name}'] = f.read_text()
    BACKUP.write_text(json.dumps(cifra(json.dumps(arch, ensure_ascii=False).encode(), chiave)))

    from collections import Counter
    print(f'{len(passi)} passi da {len(conteggi)} documenti ·', dict(Counter(p['tipo_fonte'] for p in passi)))
    print('scritto', USCITA.relative_to(ROOT), f'{USCITA.stat().st_size/1024:.0f} KB (cifrato) e', BACKUP.relative_to(ROOT))
    if mancanti: print('MANCANO (scaricarli/rigenerarli e rilanciare):', *mancanti, sep='\n  ')

if __name__ == '__main__':
    main()
