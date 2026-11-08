"""Genera solo /siracusa/ dai dati esportati dalla Page; non modifica la home.
Python 3, sola libreria standard. Nessun download durante la generazione.
"""
from pathlib import Path
import json,html
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'siracusa'
d=json.loads((OUT/'dati.json').read_text())
esc=lambda s:html.escape(str(s),quote=True)
AREAS={'Neapolis':('neapolis.html','La Neapolis'),'Ortigia':('ortigia.html','Ortigia'),'Città':('citta.html','Altri luoghi della città'),'Territorio connesso':('dintorni.html','Dintorni: storia, rilievi e acque')}
places={p['id']:p for p in d['data']}
def plink(pid):return '/siracusa/'+AREAS[places[pid]['area']][0]+'#'+pid
def link(ref):return '<a href="'+esc(ref['href'])+'">'+esc(ref['title'])+'</a>'
def reflist(refs):
 unique={r['href']:r for r in refs}
 return '<ul class="biblio">'+''.join('<li>'+link(r)+'</li>' for r in unique.values())+'</ul>'
def section(title,body,sid=''):
 return '<section class="stop"'+(' id="'+esc(sid)+'"' if sid else '')+'><div class="wrap"><div class="stop-head"><h2>'+esc(title)+'</h2></div>'+body+'</div></section>'
def note(body):return '<aside class="atlas-note">'+body+'</aside>'
WARNING=note('<p><strong>Progetto in preparazione.</strong> Luoghi e sequenze sono proposte di studio, non percorsi pedonali validati né uscite prenotate. Accessi, ombra, spazio di sosta e accessibilità sono da verificare in sopralluogo. Per le attività nelle aree archeologiche servono le autorizzazioni del Parco e gli accordi con i gestori; nessuna raccolta o manipolazione di reperti, rocce o organismi.</p><p>Memoria e narrazione orale: <strong>da raccogliere con le classi</strong>. Nessuna testimonianza è già raccolta e nessuna intervista o attività con le classi è stata avviata.</p>')
FONT='<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&display=swap" rel="stylesheet">'
def page(file,title,lede,body):
 nav=[('/','La Strada'),('/siracusa/','Atlante'),('/siracusa/neapolis.html','Neapolis'),('/siracusa/ortigia.html','Ortigia'),('/siracusa/citta.html','Città'),('/siracusa/dintorni.html','Dintorni'),('/siracusa/percorsi.html','Per classe'),('/siracusa/fonti.html','Fonti')]
 links=''.join('<li><a href="'+u+'"'+(' aria-current="page"' if u==('/siracusa/' if file=='index.html' else '/siracusa/'+file) else '')+'>'+t+'</a></li>' for u,t in nav)
 result='<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' — La Strada dei Bambini</title><meta name="description" content="'+esc(lede)+'">'+FONT+'<link rel="stylesheet" href="/siracusa/stile-base.css"><link rel="stylesheet" href="/siracusa/atlante.css"><script src="/siracusa/atlante.js" defer></script></head><body><a class="skip" href="#contenuto">Vai ai contenuti</a><nav class="nav" aria-label="Navigazione"><div class="wrap"><a class="brand" href="/">Strada dei Bambini</a><ul>'+links+'</ul></div></nav><header class="atlas-hero" id="top"><div class="wrap"><p class="where2"><span class="dash" aria-hidden="true"></span> Comunità educanti · Siracusa</p><h1>'+esc(title)+'</h1><p class="lede">'+esc(lede)+'</p></div></header><main class="route" id="contenuto">'+body+'</main><footer><div class="wrap"><span><a href="/">La Strada dei Bambini</a> · Atlante di Siracusa</span><span>Ricognizione preparatoria · 8 novembre 2026 · Europe/Rome</span><a href="/siracusa/fonti.html">Fonti, limiti e materiali</a></div></footer></body></html>\n'
 (OUT/file).write_text(result)

def select(label,key,opts):
 return '<label>'+esc(label)+'<select data-filter="'+key+'"><option value="">Tutti</option>'+''.join('<option value="'+esc(v.lower())+'">'+esc(t)+'</option>' for v,t in opts)+'</select></label>'
def catalogue():
 subjects=sorted({k for p in d['data'] for k in p['acts']})
 filters='<div class="filters">'+select('Area','area',[(a,a) for a in AREAS])+select('Disciplina','subjects',[(x,x) for x in subjects])+select('Classe','grades',[('3P','Terza primaria'),('4P','Quarte primaria'),('2S','Seconda secondaria I grado')])+select('Genius Loci','cats',[(x['id'],x['id']+' · '+x['name']) for x in d['locusCategories']])+'<label>Cerca<input data-filter="search" type="search" placeholder="Luogo, acqua, teatro…"></label></div><p role="status" aria-live="polite" data-count="luoghi">35 luoghi</p>'
 cards=''
 for p in d['data']:
  grades='|'.join(sorted({r['grade'].lower() for r in d['pilots'] if r['id']==p['id']}))
  search=' '.join([p['name'],p['desc'],*p['acts'].values()]).lower()
  attrs={'area':p['area'].lower(),'subjects':'|'.join(k.lower() for k in p['acts']),'grades':grades,'cats':'|'.join(d['locusTags'][p['id']]).lower(),'search':search}
  cards+='<article class="atlas-card" data-filter-card '+ ' '.join('data-'+k+'="'+esc(v)+'"' for k,v in attrs.items())+'><h3><a href="'+plink(p['id'])+'">'+esc(p['name'])+'</a></h3><p class="where2">'+esc(p['id']+' · '+p['area'])+'</p><p>'+esc(p['desc'])+'</p></article>'
 return filters+'<div class="atlas-grid">'+cards+'</div><noscript><p>Senza JavaScript sono visibili tutti i luoghi; i link e i contenuti restano consultabili.</p></noscript>'
areas_intro='<div class="towns">'+''.join('<a class="town" href="/siracusa/'+f+'"><h3>'+esc(t)+'</h3><span>'+str(sum(p['area']==a for p in d['data']))+' luoghi documentati</span></a>' for a,(f,t) in AREAS.items())+'</div>'
intro='<p>Una comunità educante può riconoscere nel paesaggio un libro di testo condiviso: partire dai luoghi, individuare i saperi e costruire insieme alle scuole un sussidiario locale. A Siracusa questo lavoro è nella fase di raccolta e organizzazione delle fonti.</p><p>L’atlante collega storia, archeologia e preistoria alle altre discipline: dalla roccia delle latomie all’acqua del Ciane, dalle stratificazioni di Ortigia ai rapporti fra città, subcolonie e altopiano ibleo. Sono selezionati dintorni con un legame storico o orografico con Siracusa, non semplicemente luoghi vicini.</p>'+WARNING+areas_intro+'<div class="atlas-nav"><a class="cta" href="/siracusa/percorsi.html">Le proposte per classe</a><a class="cta alt" href="/siracusa/fonti.html">Leggere le fonti</a></div>'
steps=['Raccogliere: natura, documenti e luoghi, distinguendo ciò che è noto da ciò che va osservato.','Riunire le parti: collegare roccia, acqua, lavoro, culti e forma della città.','Trovare l’essenza: proporre sintesi plurali, motivate e provvisorie.','Chiedere al luogo «chi sei tu?»: preparare ascolto e domande; le voci sono ancora da raccogliere.','Chiedere il permesso di ricreare: riconoscere soglie, ferite, custodi e autorizzazioni necessarie.','Trasformare il passato mentre emerge il futuro: distinguere recuperi reali e progetti, margini e luoghi da ripensare.','Manifestare l’intenzione: immaginare una mappa o una restituzione condivisa, non già realizzata.']
method='<p>La lettura si ispira a <em>Mappe Genius Loci</em> di Danilo Casertano e Andrea Rossetto, documento di lavoro fornito al progetto, e al percorso a U del genius loci survey di Ruskin Mill. Questa è una sintesi preparatoria, non il resoconto di un’indagine già compiuta.</p><ol>'+''.join('<li>'+esc(x)+'</li>' for x in steps)+'</ol><p>Le categorie 01–16 e la «ferita del luogo» sono domande di ricerca, non etichette definitive. Percezioni e significati non sono misure di energie fisiche. Memoria orale: <strong>da raccogliere con le classi</strong>, con consenso e attenzione alla privacy.</p><details><summary>Le categorie: che cosa cercare</summary>'+''.join('<h3>'+esc(c['id']+' · '+c['name'])+'</h3><p>'+esc(c['look'])+'</p>' for c in d['locusCategories'])+'</details>'
page('index.html','Atlante di Siracusa','35 luoghi e proposte di studio per una terza primaria, due quarte e una seconda secondaria di primo grado.',section('Una città che può educare',intro,'progetto')+section('Il metodo: Mappe Genius Loci',method,'metodo')+section('Luoghi e saperi da esplorare',catalogue(),'luoghi'))

for area,(file,title) in AREAS.items():
 content=WARNING
 for p in d['data']:
  if p['area']!=area:continue
  pid=p['id'];g=d['geo'][pid]
  body='<p>'+esc(p['desc'])+'</p>'
  if p.get('link'):body+='<p><strong>Legame con Siracusa:</strong> '+esc(p['link'])+'</p>'
  body+='<div class="atlas-tags">'+''.join('<span>'+esc(k+' · '+next(c['name'] for c in d['locusCategories'] if c['id']==k))+'</span>' for k in d['locusTags'][pid])+'</div>'
  if '12' in d['locusTags'][pid]:body+=note('<p>Memoria e narrazione orale: <strong>da raccogliere con le classi</strong>. Il tag segnala una pista futura, non testimonianze già raccolte.</p>')
  body+='<h3>Discipline e attività possibili</h3><ul>'+''.join('<li><strong>'+esc(k)+':</strong> '+esc(v)+'</li>' for k,v in p['acts'].items())+'</ul>'
  if d['extracts'].get(pid):
   body+='<h3>Dalle fonti</h3>'
   for e in d['extracts'][pid]:body+='<p>'+esc(e['text'])+'</p><p class="atlas-source">'+esc(e['cite'])+' · '+link(d['bookRefs'][e['ref']])+'</p>'
  matching=[r for r in d['pilots'] if r['id']==pid]
  if matching:body+='<h3>Per le classi pilota</h3><ul>'+''.join('<li><a href="/siracusa/percorsi.html#'+r['grade']+'-'+pid+'">'+esc(d['pilotLabels'][r['grade']])+'</a></li>' for r in matching)+'</ul>'
  body+='<p class="atlas-source"><strong>Riferimento cartografico WGS84:</strong> '+str(g['lat'])+', '+str(g['lon'])+'. '+('Approssimativo / rappresentativo. ' if g['approx'] else 'Punto pubblicato, non rilevato sul posto. ')+esc(g['note'])+' <a href="'+esc(g['href'])+'">Fonte della coordinata</a>. Non equivale a un ingresso o a una sosta autorizzata.</p>'
  body+='<p><strong>Aula all’aperto:</strong> ombra, accessibilità e spazio di sosta da verificare in sopralluogo.</p>'
  if p.get('note'):body+='<p>'+esc(p['note'])+'</p>'
  body+='<h3>Fonti e materiali aperti</h3>'+reflist([d['refs'][k] for k in p['src']])
  content+='<details class="atlas-place" id="'+pid+'"><summary>'+esc(pid+' · '+p['name'])+'</summary>'+body+'</details>'
 page(file,title,'Luoghi, fonti e agganci disciplinari: proposte da adattare alle classi e da verificare con i gestori.',section('Leggere i luoghi',content,'luoghi'))

curriculum='<p>Il riferimento delle proposte è costituito dalle <strong>Indicazioni nazionali 2012</strong> e dalla rilettura <strong>Nuovi scenari 2018</strong>: obiettivi e traguardi non sono un elenco identico di capitoli annuali per tutte le scuole. La scansione effettiva va concordata con i docenti e con il curricolo dell’istituto.</p><p>Il D.M. 221 del 9 dicembre 2025 è in vigore dall’11 febbraio 2026. Nell’anno scolastico 2026/2027 l’adozione delle nuove Indicazioni parte dalle classi prime; l’art. 5 mantiene il riferimento 2012 per le classi intermedie fino a conclusione del corso, con rimodulazioni del collegio. L’anno del progetto va confermato: nel 2027/2028 le terze primaria anticipano le nuove Indicazioni per storia, quindi non va riutilizzata automaticamente questa scansione.</p><p>Le proposte sono 35 schede classe–luogo, non 35 uscite. Le due quarte condividono gli obiettivi; acqua/papiro e costa/scambi possono essere filoni di ricerca complementari, senza assegnazioni già decise. Greco e latino si incontrano attraverso traduzioni, non come prerequisiti.</p>'+reflist([d['curriculumRefs'][k] for k in ['n2012','scenari','nuove','gu','civica']])+WARNING
classnotes={'3P':'Fonti, successione, preistoria e ambiente locale: il Paolo Orsi è il primo riferimento documentale per la preistoria. Le cave greche non sono siti paleolitici; leggere una pianta stratificata è un esercizio sul tempo, non uno studio sistematico anticipato della Grecia.','4P':'Civiltà dei fiumi e del Mediterraneo, scrittura, carte e relazioni ambiente–attività umane. Sicilia e Siracusa sono casi locali; Grecia classica e Archimede sono confronti o arricchimenti, non presunti capitoli obbligatori di quarta. Lo studio sistematico delle regioni amministrative non è assunto come obbligatorio in quarta.','2S':'Età moderna e geografia europea: Giudecca e 1492, Camera reginale, trasformazioni urbane e ricostruzione dopo il 1693. Arabi, Normanni e Svevi sono ripresa medievale e ponte; non un asse nazionale obbligatorio della seconda. I pesi delle proposte vanno concordati con il docente.'}
activities='<div class="filters">'+select('Classe','grades',[('3P','Terza primaria'),('4P','Due quarte primaria · base comune'),('2S','Seconda secondaria I grado')])+'</div><p data-count="proposte" role="status" aria-live="polite">35 proposte</p>'
for grade in ['3P','4P','2S']:
 activities+='<section id="'+grade+'"><h3>'+esc(d['pilotLabels'][grade])+'</h3><p>'+esc(classnotes[grade])+'</p>'
 for r in d['pilots']:
  if r['grade']!=grade:continue
  p=places[r['id']]
  body='<p><a href="'+plink(p['id'])+'">Scheda del luogo e fonti</a></p><ul>'+''.join('<li><strong>'+esc(k)+':</strong> '+esc(v)+'</li>' for k,v in r['topics'].items())+'</ul><p><strong>Attività proposta:</strong> '+esc(r['outdoor'])+'</p>'
  if r.get('condition'):body+='<p><strong>Condizioni e limiti:</strong> '+esc(r['condition'])+'</p>'
  body+='<p>Valutare la chiarezza del prodotto (mappa, scheda, didascalia o tabella), l’uso della fonte e la distinzione tra osservazione e ipotesi. Supporti inclusivi, tempi e spazio di sosta sono da concordare.</p>'
  body+=reflist([d['bookRefs'][k] for k in r.get('bib',[])])
  activities+='<details class="atlas-place" id="'+grade+'-'+p['id']+'" data-filter-card data-grades="'+grade.lower()+'"><summary>'+esc(p['id']+' · '+p['name'])+'</summary>'+body+'</details>'
 activities+='</section>'
page('percorsi.html','Proposte per classe','Terza primaria, due quarte e seconda secondaria: leggere Siracusa a partire da luoghi, documenti e domande.',section('Curricolo e condizioni di lavoro',curriculum,'curricolo')+section('Scegliere le tappe',activities,'proposte')+section('Esempi di scansione annuale','<p>I curricoli seguenti sono esempi pubblici, non quelli delle scuole pilota né una distribuzione ministeriale obbligatoria per anno.</p>'+reflist([d['curriculumRefs'][k] for k in ['st3','st4','st2','geog']]),'esempi'))

sourceintro='<p>Questa prima versione deriva dalla Page di lavoro <em>Siracusa, atlante delle aule possibili</em>. Una fonte aperta può essere un testo, una scheda ufficiale, un abstract o una mappa: non sono equivalenti. Download non significa lettura integrale; nessun risultato è attribuito a testi riservati non letti.</p><p>Si rinvia agli originali legalmente accessibili: <strong>nessun PDF di terzi è ospitato nel sito</strong>. L’accesso pubblico non è una licenza di riproduzione. Nella sezione Siracusa non sono usate nuove immagini di terzi. Le citazioni e i limiti di lettura accompagnano le singole schede.</p><p><a href="https://cursor.com/canvas/store-6641ac7f-ad1b-45eb-a87e-d6e9e958bef2/66d27c89-67aa-4256-a6ef-6bcd440a89c9">Page di lavoro dell’atlante</a> · la sua consultazione può dipendere dai permessi della piattaforma; le fonti originali sono elencate qui sotto.</p>'
used={k for p in d['data'] for k in p['src']}
body=section('Provenienza e diritti',sourceintro,'provenienza')+section('Luoghi, parco e materiali educativi',reflist([d['refs'][k] for k in sorted(used)]+[d['refs'][k] for k in ['inda','parco','orsi','papiro','plem']]),'istituzioni')
books=''
for b in d['bibliography']:
 if b['id'] in ['B05','B06','B09','B11']:continue
 refs=[d['bookRefs'][k] for k in b['links'] if k not in ['B05','B05r','B01d']]
 books+='<details class="atlas-place"><summary>'+esc(b['id']+' · '+b['title'])+'</summary><p>'+esc(b['status'])+'</p><p>'+esc(b['read'])+'</p>'+reflist(refs)+'</details>'
body+=section('Testi e letture documentate',books,'bibliografia')
theses=''
for t in d['theses']:
 if t['access'] not in ['Sì','Parziale'] and t['id']!='TH25':continue
 status='Testo aperto' if t['access']=='Sì' else 'Solo tavole aperte; testo riservato' if t['access']=='Parziale' else 'Solo scheda pubblica e abstract; testo riservato, non letto'
 theses+='<li>'+link({'title':t['author']+' · '+t['title']+' · '+t['uni']+', '+t['year']+' ('+t['level']+')','href':t['href']})+'<small>'+esc(status+' — '+t['note'])+'</small></li>'
body+=section('Tesi: testi aperti e abstract dichiarati','<p>Il repertorio di lavoro conta 26 record: 16 testi aperti, uno con sole tavole, otto senza PDF pubblico e uno con integrale non verificato. Qui si collegano i testi aperti, le tavole pubbliche e, per la tonnara, la sola scheda/abstract effettivamente letti. Non si offrono accessi a file riservati. Alcune tesi sono solo scaricate, non ancora analizzate.</p><ul class="biblio">'+theses+'</ul>','tesi')
body+=section('Curricolo',reflist(list(d['curriculumRefs'].values())),'curricolo')
body+=section('Metodo e limiti','<p>Casertano–Rossetto, <em>Mappe Genius Loci</em>, documento di lavoro fornito al progetto: qui solo una breve sintesi, senza distribuire il documento. Nessun sopralluogo, accordo, intervista o attività scolastica è stato effettuato.</p><p>Tutti i 35 luoghi hanno riferimenti cartografici, ma 28 sono rappresentativi o approssimativi. Alle Saline manca ancora il punto specifico dei bacini; i riferimenti di aree estese non sono aule. Condizioni di conservazione e programmi delle fonti datate non sono verifiche attuali.</p><p>Per completare le ricerche restano da leggere integralmente, con copie legittime, diversi libri e contributi: Ampolo 2011, Monterosso 2024, il censimento Arena–Lanteri–Di Guardo 2023 e gli atti AIA 2010 non sono qui riassunti né presentati come letti.</p>','limiti')
page('fonti.html','Fonti e bibliografia','Materiali originali, testi aperti, letture dichiarate e limiti della ricognizione.',body)
print('Generate 7 pagine, 35 luoghi, 35 proposte; home non modificata dal generatore.')
