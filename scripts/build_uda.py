"""Estensione statica del modello Salento: proposte e moduli senza invio dati."""
import json,html

def build(ROOT,d,page,section,note,reflist):
 OUT=ROOT/'siracusa';(OUT/'schede').mkdir(exist_ok=True)
 u=json.loads((OUT/'schede.json').read_text());e=lambda x:html.escape(str(x),quote=True)
 def para(s):return '<p>'+e(s)+'</p>'
 def listing(values):return '<ul>'+''.join('<li>'+e(x)+'</li>' for x in values)+'</ul>'
 def pairs(rows):return '<dl class="uda-fields">'+''.join('<dt>'+e(k)+'</dt><dd>'+e(v)+'</dd>' for k,v in rows)+'</dl>'
 def caseurl(c):return '/siracusa/schede/'+c['file']
 def cycle():return ''.join('<h3>'+e(x['state'])+'</h3>'+para(x['meaning']) for x in u['cycle'])
 intro=para(u['model']['source'])+para(u['model']['architecture'])+note('<p><strong>Tutte le schede sono PROPOSTE.</strong> Nessuna data di esperienza, voce, osservazione o materiale prodotto è ancora disponibile. La narrazione indica ciò che si propone, non ciò che è avvenuto.</p>')
 intro+=para('Il ciclo concordato è: noi proponiamo dalle fonti; le scuole mettono in pratica; le esperienze sono arricchite con osservazioni, voci e prodotti autentici e revisionate. Non basta aggiungere un commento per cambiare stato.')+cycle()
 filters='<div class="filters"><label>Classe<select data-filter="grades"><option value="">Tutte</option><option value="3p">Terza primaria</option><option value="4p">Due quarte primaria</option><option value="2s">Seconda secondaria I grado</option></select></label><label>Stato<select data-filter="state"><option value="">Tutti</option><option value="proposta">Proposta</option><option value="sperimentata">Sperimentata</option><option value="verificata">Verificata</option></select></label></div><p data-count="schede UDA" role="status" aria-live="polite">3 schede UDA</p>'
 cards='<div class="atlas-grid">'+''.join('<article class="atlas-card" data-filter-card data-grades="'+c['grade'].lower()+'" data-state="proposta"><p class="where2">'+e(c['classLabel'])+' · PROPOSTA</p><h3><a href="'+caseurl(c)+'">'+e(c['title'])+'</a></h3>'+para(c['placeName']+' · '+c['code'])+para(c['subtitle'])+'</article>' for c in u['cases'])+'</div>'
 synoptic='<div class="uda-table"><table><caption>Schede in preparazione: prodotti attesi, non già realizzati</caption><thead><tr><th>Codice / titolo</th><th>Classe / luogo</th><th>Discipline</th><th>Prodotto atteso</th><th>Stato</th></tr></thead><tbody>'
 for c in u['cases']:
  synoptic+='<tr><td><a href="'+caseurl(c)+'">'+e(c['code']+' · '+c['title'])+'</a></td><td>'+e(c['classLabel']+' · '+c['placeName'])+'</td><td>'+e(c['synopsis'][3][1])+'</td><td>'+e(c['synopsis'][4][1])+'</td><td>Proposta</td></tr>'
 synoptic+='</tbody></table></div>'
 model=para('Campi originali più ricorrenti: '+', '.join(u['model']['originalFields'])+'.')+para(u['model']['variants'])+para(u['model']['extension'])+para(u['model']['example'])+para(u['model']['secondary'])
 model+=note(para(u['model']['valuation'])+'<a href="'+e(u['model']['valuationLink'])+'">OM 3/2025, fonte ufficiale letta</a>')
 glossary='<dl class="uda-fields">'+''.join('<dt>'+e(k)+'</dt><dd>'+e(v)+'</dd>' for k,v in u['glossary'])+'</dl>'
 page('schede/index.html','Dalle proposte alle esperienze','Il modello del Salento per documentare Siracusa: proposta → sperimentata → verificata.',section('Un ciclo con le scuole',intro,'ciclo')+section('Le tre schede complete',filters+cards,'schede')+section('Tavola sinottica',synoptic,'sinottica')+section('Lo schema del volume',model+'<a class="cta" href="/siracusa/schede/modello.html">Modello vuoto compilabile</a>','schema')+section('Glossario operativo',glossary,'glossario'))
 for c in u['cases']:
  head='<p class="where2">'+e(c['code']+' · '+c['classLabel']+' · '+c['version'])+'</p>'+note('<p><strong>STATO: PROPOSTA.</strong> Data dell’attività: da concordare. Voci degli alunni, osservazioni dei docenti e materiali prodotti: <strong>da raccogliere</strong>. La data di versione riguarda il progetto, non una prova già svolta.</p>')+'<p><a href="'+e(c['placeUrl'])+'">Luogo nell’atlante: '+e(c['placeName'])+'</a></p>'
  body=section('L’UDA in sintesi',head+pairs(c['synopsis']),'sintesi')
  prep='<h3>Domanda generativa</h3>'+para(c['question'])+'<h3>Obiettivi osservabili</h3>'+pairs(c['objectives'])+'<h3>Prerequisiti e raccordo</h3>'+para(c['prerequisites'])+'<h3>Tempi proposti</h3>'+para(c['timing'])+'<h3>Materiali da preparare</h3>'+listing(c['materials'])
  prep+='<h3>Accessi e sicurezza</h3>'+para(c['safety'])+'<h3>Alternativa</h3>'+para(c['alternative'])+'<h3>Accessibilità e partecipazione</h3>'+para(c['inclusion'])
  body+=section('Progettare prima della prova',prep,'progetto')
  body+=section('Narrazione in movimenti · progetto',''.join('<h3>'+e(k)+'</h3>'+para(v) for k,v in c['movements']),'movimenti')
  body+=section('Tracce autentiche · spazi ancora vuoti',''.join('<aside class="uda-pending"><h3>'+e(x['title'])+'</h3><p><strong>'+e(x['value'])+'</strong></p>'+para(x['instruction'])+'</aside>' for x in c['placeholders']),'tracce')
  body+=section('Lettura pedagogica · ipotesi da verificare',''.join('<h3>'+e(k)+'</h3>'+para(v) for k,v in c['pedagogy'])+'<h3>Criteri per l’osservazione</h3>'+listing(c['criteria'])+note(para(u['model']['valuation'])),'pedagogia')
  refs=''
  for s in c['sources']:
   refs+='<h3>'+e(s['cite'])+'</h3>'+para(s['use'])+'<p><a href="'+e(s['href'])+'">'+e(s['title'])+'</a></p>'
  refs+='<h3>Indicazioni nazionali e continuità del curricolo</h3><p>I raccordi sono proposte, non un programma ministeriale identico per anno. Confermare anno scolastico e curricolo d’istituto: il regime transitorio 2026/27 delle nuove Indicazioni è spiegato nella pagina per classe.</p>'+reflist(c['curriculum'])+'<p><a href="/siracusa/percorsi.html#curricolo">Quadro curricolare e limiti per classe</a></p>'
  refs+='<h3>Per riprodurre il dispositivo</h3>'+para(c['replication'])+'<h3>Fonte del modello di documentazione</h3>'+para(u['model']['source'])+para(u['model']['secondary'])
  body+=section('Apparato · Fonti e riferimenti per replicare',refs,'apparato')
  audit=para('Registro non compilato. Non basta un commento per passare a “verificata”: occorre revisione umana datata delle evidenze e delle fonti. Mantenere separati progetto, prova e versione revisionata.')+pairs([[x['field'],'Da raccogliere / da completare dopo una prova reale'] for x in c['audit']])+'<a class="cta" href="/siracusa/schede/modello.html">Apri il modello vuoto</a>'
  body+=section('Registro della verifica · non compilato',audit,'verifica')
  page('schede/'+c['file'],c['title'],c['subtitle'],body)
 fields=''
 for i,f in enumerate(u['templateFields']):
  fields+='<label for="campo-'+str(i)+'">'+e(f)+'</label><textarea id="campo-'+str(i)+'" name="campo-'+str(i)+'" rows="3" placeholder="'+('Da raccogliere' if 'raccogliere' in f or 'verifica' in f.lower() else 'Da compilare')+'"></textarea>'
 template=note('<p><strong>Modello vuoto, compilazione soltanto locale.</strong> Non invia dati e non li salva automaticamente. Stampare o salvare prima di chiudere. Usare codici anonimi: non inserire dati personali degli alunni. La compilazione non cambia lo stato delle schede pubblicate.</p>')+'<p>I campi aggiunti per Siracusa sono distinti da quelli originali nel <a href="/siracusa/schede/#schema">modello descritto</a>. La narrazione resta progettuale fino alla prova; dopo si aggiunge il resoconto effettivo senza cancellare la proposta.</p><div class="atlas-nav"><button class="tab" type="button" data-print>Stampa / salva come PDF</button><a class="cta alt" href="/siracusa/schede/modello.md" download>Scarica il modello testuale</a></div><form class="uda-form" onsubmit="return false" autocomplete="off" aria-label="Modello UDA vuoto">'+fields+'</form>'
 page('schede/modello.html','Modello UDA da compilare','Campi originali del volume e aggiunte operative per documentare la prova e la revisione.',section('Una scheda, tre stati',template,'modello')+section('Quando cambiare stato',cycle(),'stati'))
 md='# Modello UDA Siracusa — vuoto\n\nNessuna esperienza è implicita. I tre stati sono proposta / sperimentata / verificata; il passaggio richiede evidenze e revisione umana. Non inserire nominativi o dati personali degli alunni.\n\n'
 for field in u['templateFields']:md+='## '+field+'\n\n\n\n'
 (OUT/'schede/modello.md').write_text(md)
 feature=section('Tre proposte complete, un modello da sperimentare','<p>Lo schema del volume del Salento diventa un ciclo di documentazione per Siracusa: fonti e proposte nostre, prove delle scuole, revisione con osservazioni e materiali autentici. Tutte le schede sono ancora PROPOSTE.</p>'+cards.replace(' data-filter-card','')+'<div class="atlas-nav"><a class="cta" href="/siracusa/schede/">Schema, ciclo e sinottica</a><a class="cta alt" href="/siracusa/schede/modello.html">Modello vuoto</a></div>','uda')
 for name in ['index.html','percorsi.html']:
  p=OUT/name;s=p.read_text();anchor='<main class="route" id="contenuto">';assert s.count(anchor)==1;p.write_text(s.replace(anchor,anchor+feature))
 p=OUT/'fonti.html';s=p.read_text();s=s.replace('</main>',section('Il modello Salento e l’aggiornamento della valutazione',para(u['model']['source'])+para(u['model']['architecture'])+para(u['model']['valuation'])+'<p><a href="'+e(u['model']['valuationLink'])+'">Ordinanza ministeriale 3/2025, artt. 3 e 7</a> · <a href="/siracusa/schede/">Schema e applicazioni</a></p>','modello-salento')+'</main>');p.write_text(s)
 print('Generate 3 schede UDA in stato proposta, indice/sinottica e modello vuoto; nessuna testimonianza compilata.')
