/**
 * Koppeling "Aanvragen school" → "Vervangingen".
 *
 * Draait als Apps Script-project van mdm@ en wordt aangeroepen door de
 * AppSheet-bot "Verzoek verwerken" (app Aanvragen school), telkens wanneer een
 * knop een rij toevoegt aan het tabblad Verzoeken.
 *
 *   Voorstellen  → berekent de te vervangen lesuren en schrijft ze als
 *                  'Voorstel' in het tabblad Vervangingslijnen.
 *   Doorsturen   → stuurt alle 'Voorstel'-lijnen via de AppSheet-API naar de
 *                  tabel Vervangingen van de app Vervangingen (die publiceert
 *                  dan zelf naar het vervangingsrooster).
 *   Intrekken    → verwijdert de eerder doorgestuurde vervangingen weer.
 *
 * De API-sleutel staat NIET in deze code maar in de scripteigenschap
 * APPSHEET_ACCESS_KEY (Projectinstellingen → Scripteigenschappen).
 */
const KOPPELING = Object.freeze({
  aanvragenId: '19r9VwHI2J7VgjKCT3IQGcVB_42P6E3tfpRu4G5wzAfU',
  roosterId: '1g8kmG3UCULBvI4liSpIpxWhv6Jqd4dVS5v_WFDvfWOE',
  vervangingenAppId: '739c61ee-5187-4072-bb56-aab4fbf96560',
  vervangingenTabel: 'Vervangingen',
  standaardReden: 'Studie → taak zie planner',
  middagUur: 6,
  bladen: { NAS: 'Aanvragen', EXC: 'AanvragenExcursie' },
});

/* ------------------------------------------------------------------ */
/* Ingang voor de AppSheet-bot                                         */
/* ------------------------------------------------------------------ */

const WACHTRIJ = 'In wachtrij: wordt op de achtergrond verwerkt (±35 s per lesuur).';
const LOOPTIJD_MS = 4.5 * 60 * 1000; // Apps Script stopt na 6 min; daarna gaat een nieuwe run verder.

/**
 * Wordt door de bot aangeroepen. AppSheet breekt een script na ±2 minuten af, en elke
 * vervanging via de API duurt ±35 s (Vervangingen publiceert telkens opnieuw). Doorsturen
 * en Intrekken gaan daarom naar een wachtrij die op de achtergrond wordt afgewerkt.
 */
function verwerkVerzoek(verzoekId, type, soort, aanvraagId, door) {
  try {
    if (type === 'Doorsturen' || type === 'Intrekken') {
      metSlot_(() => schrijfResultaat_(verzoekId, WACHTRIJ));
      planWachtrij_();
      return WACHTRIJ;
    }
    if (type === 'Gewijzigd') {
      // Gelogd door de bot "Wijziging na doorsturen": niets te doen, enkel registreren.
      const melding = 'Aanvraag gewijzigd na doorsturen: vervangingen nakijken (eventueel intrekken en opnieuw voorstellen).';
      metSlot_(() => schrijfResultaat_(verzoekId, melding));
      return melding;
    }
    if (type !== 'Voorstellen') throw new Error('Onbekend verzoektype: ' + type);
    return metSlot_(() => {
      const resultaat = stelVoor_(soort, aanvraagId);
      schrijfResultaat_(verzoekId, resultaat);
      return resultaat;
    });
  } catch (e) {
    try { metSlot_(() => schrijfResultaat_(verzoekId, 'FOUT: ' + e.message)); } catch (e2) { /* niets meer te doen */ }
    return 'FOUT: ' + e.message;
  }
}

/** Achtergrondtaak: werkt alle verzoeken 'In wachtrij' af, met een tijdslimiet per run. */
function werkWachtrijAf() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'werkWachtrijAf')
    .forEach(t => ScriptApp.deleteTrigger(t));
  const props = PropertiesService.getScriptProperties();
  if (Number(props.getProperty('WACHTRIJ_BEZIG_TOT') || 0) > Date.now()) { planWachtrij_(60 * 1000); return; }
  const deadline = Date.now() + LOOPTIJD_MS;
  props.setProperty('WACHTRIJ_BEZIG_TOT', String(deadline + 60 * 1000));
  try {
    const open = leesTabel_(blad_(KOPPELING.aanvragenId, 'Verzoeken')).rijen
      .filter(r => String(r.Resultaat).indexOf('In wachtrij') === 0);
    for (const v of open) {
      let resultaat;
      try {
        resultaat = v.Type === 'Doorsturen' ? stuurDoor_(v.Soort, v.AanvraagID, v.Door, deadline)
          : trekIn_(v.Soort, v.AanvraagID, deadline);
      } catch (e) {
        resultaat = 'FOUT: ' + e.message;
      }
      if (resultaat === null) { planWachtrij_(); return; } // tijd op: volgende run gaat verder
      metSlot_(() => schrijfResultaat_(v.VerzoekID, resultaat));
    }
  } finally {
    props.deleteProperty('WACHTRIJ_BEZIG_TOT');
  }
}

function planWachtrij_(naMs) {
  const bestaat = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'werkWachtrijAf');
  if (!bestaat) ScriptApp.newTrigger('werkWachtrijAf').timeBased().after(naMs || 1000).create();
}

function metSlot_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ */
/* Zuivere logica (lokaal getest met node)                             */
/* ------------------------------------------------------------------ */

/** "8:45:00", "08.25", "13:50" of minuten → minuten sinds middernacht; anders null. */
function minuten(waarde) {
  if (waarde === null || waarde === undefined || waarde === '') return null;
  if (typeof waarde === 'number') return waarde;
  const m = String(waarde).trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Datumtekst → 'YYYY-MM-DD'. Aanvaardt YYYY-MM-DD, DD-MM-YYYY en DD/MM/YYYY (Belgisch). */
function isoDatum(waarde) {
  const tekst = String(waarde || '').trim();
  let m = tekst.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  m = tekst.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  return null;
}

function pad2_(n) { return String(n).padStart(2, '0'); }

/** Weekdag volgens het lesrooster: maandag = 1 … vrijdag = 5, weekend = 0/6. */
function weekdag(iso) {
  const [j, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, d)).getUTCDay();
}

/** Lijstwaarde uit AppSheet (EnumList " , ") of vrije tekst → array. */
function lijst(waarde) {
  return String(waarde || '').split(/\s*[,;\n]\s*/).map(s => s.trim()).filter(Boolean);
}

function naamSleutel(naam) {
  return String(naam || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').replace(/\s+\./g, '.').trim();
}

/**
 * Berekent per datum, lesuur en leerkracht één vervangingslijn.
 * opdracht: { datums: [iso], start, einde (minuten of null = hele dag),
 *             leerkrachten: [Untis-naam], uitgeslotenKlassen: [klas] }
 * lessen:   [{ dag, uur, leerkracht, klas, van, tot }]   (van/tot iso of leeg)
 * uren:     [{ uur, start, einde }]                      (minuten)
 */
function planLijnen(opdracht, lessen, uren, middagUur) {
  const start = opdracht.start == null ? 0 : opdracht.start;
  const einde = opdracht.einde == null ? 24 * 60 : opdracht.einde;
  if (einde <= start) throw new Error('Einduur ligt niet na het startuur');
  const geraakteUren = uren
    .filter(u => Number(u.uur) !== Number(middagUur == null ? 6 : middagUur))
    .filter(u => u.start < einde && u.einde > start)
    .map(u => Number(u.uur));
  const leerkrachten = new Set(opdracht.leerkrachten.map(naamSleutel));
  const uitgesloten = new Set((opdracht.uitgeslotenKlassen || []).map(k => k.toUpperCase().replace(/\s+/g, '')));
  const perSleutel = new Map();
  for (const datum of [...new Set(opdracht.datums)].sort()) {
    const dag = weekdag(datum);
    if (dag < 1 || dag > 5) continue;
    for (const les of lessen) {
      if (Number(les.dag) !== dag) continue;
      if (!geraakteUren.includes(Number(les.uur))) continue;
      if (!leerkrachten.has(naamSleutel(les.leerkracht))) continue;
      if (les.van && les.van > datum) continue;
      if (les.tot && les.tot < datum) continue;
      if (uitgesloten.has(String(les.klas || '').toUpperCase().replace(/\s+/g, ''))) continue;
      const sleutel = [datum, Number(les.uur), naamSleutel(les.leerkracht)].join('|');
      if (!perSleutel.has(sleutel)) {
        perSleutel.set(sleutel, { datum, uur: Number(les.uur), leerkracht: String(les.leerkracht).trim(), klassen: [] });
      }
      const lijn = perSleutel.get(sleutel);
      if (les.klas && !lijn.klassen.includes(les.klas)) lijn.klassen.push(les.klas);
    }
  }
  return [...perSleutel.values()]
    .map(l => ({ datum: l.datum, uur: l.uur, leerkracht: l.leerkracht, klas: l.klassen.sort().join(' / ') }))
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.uur - b.uur || a.leerkracht.localeCompare(b.leerkracht));
}

/** Bouwt de opdracht voor planLijnen uit een aanvraagrij (objecten met weergavewaarden). */
function opdrachtUitAanvraag(soort, rij, untisNaamAanvrager) {
  if (soort === 'NAS') {
    if (!untisNaamAanvrager) throw new Error('Geen UntisNaam voor ' + rij.AanvragerEmail + ' in tabblad Personen');
    const datums = [isoDatum(rij.DatumNascholing), ...lijst(rij.ExtraData).map(isoDatum)].filter(Boolean);
    if (!datums.length) throw new Error('Aanvraag heeft geen geldige datum');
    return { datums, start: minuten(rij.Startuur), einde: minuten(rij.Einduur), leerkrachten: [untisNaamAanvrager], uitgeslotenKlassen: [] };
  }
  if (soort === 'EXC') {
    const leerkrachten = lijst(rij.Begeleiders);
    if (!leerkrachten.length) throw new Error('Vul eerst het veld Begeleiders in');
    const datum = isoDatum(rij.DatumActiviteit);
    if (!datum) throw new Error('Activiteit heeft geen geldige datum');
    const starts = [minuten(rij.Startuur), minuten(rij.VertrekuurHeen)].filter(v => v != null);
    const eindes = [minuten(rij.Einduur), minuten(rij.VertrekuurTerug)].filter(v => v != null);
    return {
      datums: [datum],
      start: starts.length ? Math.min(...starts) : null,
      einde: eindes.length ? Math.max(...eindes) : null,
      leerkrachten,
      uitgeslotenKlassen: lijst(rij.Klassen),
    };
  }
  throw new Error('Onbekende soort: ' + soort);
}

/** 'YYYY-MM-DD' → 'MM/DD/YYYY' voor de AppSheet-API (Locale en-US). */
function apiDatum(iso) {
  const [j, m, d] = iso.split('-');
  return m + '/' + d + '/' + j;
}

/* ------------------------------------------------------------------ */
/* Sheets                                                              */
/* ------------------------------------------------------------------ */

function blad_(ssId, naam) {
  const sh = SpreadsheetApp.openById(ssId).getSheetByName(naam);
  if (!sh) throw new Error('Tabblad ontbreekt: ' + naam);
  return sh;
}

/** Leest een tabblad als objecten op basis van de koprij (weergavewaarden). */
function leesTabel_(sh) {
  const waarden = sh.getDataRange().getDisplayValues();
  const koppen = waarden[0].map(k => String(k).trim());
  const rijen = waarden.slice(1).map((r, i) => {
    const o = { _rij: i + 2 };
    koppen.forEach((k, j) => { if (k) o[k] = r[j]; });
    return o;
  });
  return { koppen, rijen };
}

function zetCel_(sh, koppen, rij, kolom, waarde) {
  const j = koppen.indexOf(kolom);
  if (j < 0) throw new Error('Kolom ontbreekt: ' + kolom);
  sh.getRange(rij, j + 1).setValue(waarde);
}

function vindAanvraag_(soort, aanvraagId) {
  const naam = KOPPELING.bladen[soort];
  if (!naam) throw new Error('Onbekende soort: ' + soort);
  const sh = blad_(KOPPELING.aanvragenId, naam);
  const t = leesTabel_(sh);
  const rij = t.rijen.find(r => r.AanvraagID === aanvraagId);
  if (!rij) throw new Error('Aanvraag niet gevonden: ' + aanvraagId);
  return { sh, koppen: t.koppen, rij };
}

function leesRooster_() {
  // Zelfde uitsluiting als Klaskeuze in de app Vervangingen: geen klasuren voor COM/STU/PER.
  const lessen = leesTabel_(blad_(KOPPELING.roosterId, 'lestabellen-test')).rijen
    .filter(r => !['COM', 'STU', 'PER'].includes(String(r.vak).trim())).map(r => ({
    dag: Number(r.dag), uur: Number(r.uur), leerkracht: r.leerkracht, klas: r.klas,
    van: isoDatum(r.GeldigVan) || '', tot: isoDatum(r.GeldigTot) || '',
  }));
  const uren = leesTabel_(blad_(KOPPELING.roosterId, 'uren-test')).rijen
    .map(r => ({ uur: Number(r.uur), start: minuten(r.start), einde: minuten(r.einde) }))
    .filter(u => u.uur && u.start != null && u.einde != null);
  return { lessen, uren };
}

function schrijfResultaat_(verzoekId, tekst) {
  const sh = blad_(KOPPELING.aanvragenId, 'Verzoeken');
  const t = leesTabel_(sh);
  const rij = t.rijen.find(r => r.VerzoekID === verzoekId);
  if (rij) zetCel_(sh, t.koppen, rij._rij, 'Resultaat', String(tekst).slice(0, 1000));
}

/* ------------------------------------------------------------------ */
/* Voorstellen                                                         */
/* ------------------------------------------------------------------ */

function stelVoor_(soort, aanvraagId) {
  const { rij } = vindAanvraag_(soort, aanvraagId);
  if (rij.Status !== 'Goedgekeurd') throw new Error('Aanvraag is nog niet goedgekeurd (status: ' + rij.Status + ')');
  const bezig = leesTabel_(blad_(KOPPELING.aanvragenId, 'Verzoeken')).rijen
    .some(r => r.AanvraagID === aanvraagId && String(r.Resultaat).indexOf('In wachtrij') === 0);
  if (bezig) throw new Error('Deze aanvraag wordt nog doorgestuurd of ingetrokken; probeer het straks opnieuw.');
  let untis = '';
  if (soort === 'NAS') {
    const personen = leesTabel_(blad_(KOPPELING.aanvragenId, 'Personen')).rijen;
    const p = personen.find(x => String(x.Email).toLowerCase() === String(rij.AanvragerEmail).toLowerCase());
    untis = p ? String(p.UntisNaam || '').trim() : '';
  }
  const opdracht = opdrachtUitAanvraag(soort, rij, untis);
  const { lessen, uren } = leesRooster_();
  const plan = planLijnen(opdracht, lessen, uren, KOPPELING.middagUur);

  const sh = blad_(KOPPELING.aanvragenId, 'Vervangingslijnen');
  const t = leesTabel_(sh);
  const vanAanvraag = t.rijen.filter(r => r.AanvraagID === aanvraagId);
  const alVerwerkt = new Set(vanAanvraag
    .filter(r => r.Status === 'Doorgestuurd' || r.Status === 'Bestond al')
    .map(r => [isoDatum(r.Datum), Number(r.Uur), naamSleutel(r.Leerkracht)].join('|')));
  // Oude, niet (meer) doorgestuurde lijnen vervangen (van onder naar boven verwijderen).
  vanAanvraag.filter(r => ['Voorstel', 'Fout', 'Ingetrokken'].includes(r.Status)).map(r => r._rij).sort((a, b) => b - a)
    .forEach(n => sh.deleteRow(n));

  const nieuw = plan.filter(l => !alVerwerkt.has([l.datum, l.uur, naamSleutel(l.leerkracht)].join('|')));
  if (nieuw.length) {
    const rijen = nieuw.map(l => t.koppen.map(k => ({
      LijnID: Utilities.getUuid().replace(/-/g, '').slice(0, 10),
      AanvraagID: aanvraagId,
      Soort: soort,
      Datum: datumObject_(l.datum),
      Uur: l.uur,
      Leerkracht: l.leerkracht,
      Klas: l.klas,
      Reden: KOPPELING.standaardReden,
      Opmerking: '',
      Status: 'Voorstel',
      VervangingID: '',
      Fout: '',
    }[k] ?? '')));
    sh.getRange(sh.getLastRow() + 1, 1, rijen.length, t.koppen.length).setValues(rijen);
  }
  if (!plan.length) return 'Geen lesuren gevonden in dat tijdvenster (controleer datum, uren en namen).';
  return nieuw.length + ' lesuur/uren voorgesteld' + (plan.length > nieuw.length ? ' (' + (plan.length - nieuw.length) + ' waren al doorgestuurd)' : '') + '.';
}

function datumObject_(iso) {
  const [j, m, d] = iso.split('-').map(Number);
  return new Date(j, m - 1, d, 12);
}

/* ------------------------------------------------------------------ */
/* Doorsturen / intrekken via de AppSheet-API                          */
/* ------------------------------------------------------------------ */

function apiSleutel_() {
  const sleutel = PropertiesService.getScriptProperties().getProperty('APPSHEET_ACCESS_KEY');
  if (!sleutel) throw new Error('Scripteigenschap APPSHEET_ACCESS_KEY ontbreekt');
  return sleutel;
}

function api_(actie, rijen, selector) {
  const url = 'https://api.appsheet.com/api/v2/apps/' + KOPPELING.vervangingenAppId +
    '/tables/' + encodeURIComponent(KOPPELING.vervangingenTabel) + '/Action';
  const body = { Action: actie, Properties: { Locale: 'en-US', Timezone: 'Romance Standard Time' }, Rows: rijen || [] };
  if (selector) body.Properties.Selector = selector;
  const antwoord = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { ApplicationAccessKey: apiSleutel_() }, payload: JSON.stringify(body),
  });
  const code = antwoord.getResponseCode();
  const tekst = antwoord.getContentText();
  if (code < 200 || code >= 300) throw new Error('AppSheet-API ' + actie + ' gaf ' + code + ': ' + tekst.slice(0, 1500));
  if (!tekst) return [];
  const data = JSON.parse(tekst);
  return Array.isArray(data) ? data : (data.Rows || []);
}

/** Schrijft velden van één lijn, opgezocht via LijnID (rijnummers kunnen intussen verschoven zijn). */
function zetLijn_(lijnId, velden) {
  metSlot_(() => {
    const sh = blad_(KOPPELING.aanvragenId, 'Vervangingslijnen');
    const t = leesTabel_(sh);
    const r = t.rijen.find(x => x.LijnID === lijnId);
    if (r) Object.keys(velden).forEach(k => zetCel_(sh, t.koppen, r._rij, k, velden[k]));
  });
}

function zetAanvraag_(soort, aanvraagId, velden) {
  metSlot_(() => {
    const a = vindAanvraag_(soort, aanvraagId);
    Object.keys(velden).forEach(k => zetCel_(a.sh, a.koppen, a.rij._rij, k, velden[k]));
  });
}

/** Geeft null terug als de tijd op is; een volgende run gaat dan verder met de rest. */
function stuurDoor_(soort, aanvraagId, door, deadline) {
  const aanvraag = vindAanvraag_(soort, aanvraagId);
  if (aanvraag.rij.Status !== 'Goedgekeurd') throw new Error('Aanvraag is nog niet goedgekeurd');
  const lijnen = leesTabel_(blad_(KOPPELING.aanvragenId, 'Vervangingslijnen')).rijen
    .filter(r => r.AanvraagID === aanvraagId && (r.Status === 'Voorstel' || r.Status === 'Fout'));
  if (!lijnen.length) throw new Error('Geen voorgestelde lijnen om door te sturen (eerst "Vervangingen voorstellen")');
  lijnen.forEach(l => { l._iso = isoDatum(l.Datum); if (!l._iso) throw new Error('Ongeldige datum in lijn ' + l.LijnID); });

  // Dubbels vermijden: bestaande vervangingen op dezelfde dagen ophalen.
  // TEXT([Datum], …) matcht via de API niet; DATE("MM/DD/YYYY") wel (Locale en-US).
  const datums = [...new Set(lijnen.map(l => l._iso))];
  const selector = 'Filter(' + KOPPELING.vervangingenTabel + ', IN([Datum], LIST(' +
    datums.map(d => 'DATE("' + apiDatum(d) + '")').join(', ') + ')))';
  const bestaand = new Set(api_('Find', [], selector).map(r =>
    [isoUitApi_(r.Datum), Number(r.Uur), naamSleutel(r.Leerkracht)].join('|')));

  let ok = 0, dubbel = 0, fout = 0, onaf = false;
  for (const l of lijnen) {
    if (deadline && Date.now() > deadline - 45 * 1000) { onaf = true; break; }
    const sleutel = [l._iso, Number(l.Uur), naamSleutel(l.Leerkracht)].join('|');
    if (bestaand.has(sleutel)) {
      zetLijn_(l.LijnID, { Status: 'Bestond al', Fout: '' });
      dubbel++;
      continue;
    }
    try {
      const terug = api_('Add', [{
        Datum: apiDatum(l._iso), Uur: String(Number(l.Uur)), Leerkracht: l.Leerkracht,
        Reden: l.Reden || KOPPELING.standaardReden, 'Meerdere dagen': false,
        Klaskeuze: l.Klas, // EnumList met scheiding " / ", zoals planLijnen ze samenvoegt
      }]);
      zetLijn_(l.LijnID, { VervangingID: terug[0] ? (terug[0]['Row ID'] || '') : '', Status: 'Doorgestuurd', Fout: '' });
      bestaand.add(sleutel);
      ok++;
    } catch (e) {
      zetLijn_(l.LijnID, { Status: 'Fout', Fout: e.message.slice(0, 1500) });
      fout++;
    }
  }
  if (ok + dubbel > 0) {
    zetAanvraag_(soort, aanvraagId, { VervangingenDoorgestuurdOp: new Date(), VervangingenDoorgestuurdDoor: door || '', Vervangingsrooster: true });
  }
  if (onaf) return null;
  return ok + ' doorgestuurd' + (dubbel ? ', ' + dubbel + ' bestonden al' : '') + (fout ? ', ' + fout + ' met fout (zie lijnen)' : '') + '.';
}

function trekIn_(soort, aanvraagId, deadline) {
  vindAanvraag_(soort, aanvraagId);
  const lijnen = leesTabel_(blad_(KOPPELING.aanvragenId, 'Vervangingslijnen')).rijen
    .filter(r => r.AanvraagID === aanvraagId && r.Status === 'Doorgestuurd' && r.VervangingID);
  if (!lijnen.length) throw new Error('Geen doorgestuurde vervangingen om in te trekken');
  let ok = 0, onaf = false;
  for (const l of lijnen) {
    if (deadline && Date.now() > deadline - 45 * 1000) { onaf = true; break; }
    try {
      api_('Delete', [{ 'Row ID': l.VervangingID }]);
      zetLijn_(l.LijnID, { Status: 'Ingetrokken', Fout: '' });
      ok++;
    } catch (e) {
      zetLijn_(l.LijnID, { Fout: e.message.slice(0, 1500) });
    }
  }
  if (onaf) return null;
  if (ok === lijnen.length) {
    zetAanvraag_(soort, aanvraagId, { VervangingenDoorgestuurdOp: '', VervangingenDoorgestuurdDoor: '', Vervangingsrooster: false });
  }
  return ok + ' van ' + lijnen.length + ' vervangingen ingetrokken.';
}

/** API-datums komen terug als MM/DD/YYYY (Locale en-US) of ISO. */
function isoUitApi_(waarde) {
  const tekst = String(waarde || '').trim();
  const m = tekst.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + pad2_(m[1]) + '-' + pad2_(m[2]);
  return isoDatum(tekst);
}

/* Node-export voor de lokale tests; in Apps Script bestaat `module` niet. */
if (typeof module !== 'undefined') {
  module.exports = { minuten, isoDatum, weekdag, lijst, naamSleutel, planLijnen, opdrachtUitAanvraag, apiDatum, isoUitApi_ };
}
