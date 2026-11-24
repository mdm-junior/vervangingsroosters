const test = require('node:test');
const assert = require('node:assert/strict');
const k = require('./Koppeling.js');

// Lesuren zoals in uren-test (start/einde als "08.25").
const uren = [
  ['1', '08.25', '09.15'], ['2', '09.15', '10.05'], ['3', '10.05', '10.55'], ['4', '11.10', '12.00'],
  ['5', '12.00', '12.50'], ['6', '12.50', '13.50'], ['7', '13.50', '14.40'], ['8', '14.40', '15.30'], ['9', '15.30', '16.20'],
].map(([uur, s, e]) => ({ uur: Number(uur), start: k.minuten(s), einde: k.minuten(e) }));

const les = (dag, uur, leerkracht, klas, van = '', tot = '') => ({ dag, uur, leerkracht, klas, van, tot });

test('tijden en datums uit Sheets en AppSheet worden herkend', () => {
  assert.equal(k.minuten('8:45:00'), 525);
  assert.equal(k.minuten('08.25'), 505);
  assert.equal(k.minuten(''), null);
  assert.equal(k.isoDatum('13-11-2026'), '2026-11-13');
  assert.equal(k.isoDatum('01/09/2026'), '2026-09-01');
  assert.equal(k.isoDatum('2026-10-27'), '2026-10-27');
  assert.equal(k.isoDatum('8-6-2027'), '2027-06-08');
  assert.equal(k.weekdag('2027-06-08'), 2); // dinsdag
  assert.deepEqual(k.lijst('Wille K. , Facon S.'), ['Wille K.', 'Facon S.']);
  assert.equal(k.apiDatum('2027-06-08'), '06/08/2027');
  assert.equal(k.isoUitApi_('06/08/2027'), '2027-06-08');
});

test('nascholing: alleen lesuren die het tijdvenster raken, nooit de middagpauze', () => {
  const lessen = [
    les(2, 1, 'Van Dyck M.', '3A'), les(2, 3, 'Van Dyck M.', '4B'), les(2, 4, 'Van Dyck M.', '5C'),
    les(2, 6, 'Van Dyck M.', 'TAO'), les(2, 7, 'Van Dyck M.', '6D'), les(2, 3, 'Andere X.', '1A1'),
    les(3, 2, 'Van Dyck M.', '2A1'),
  ];
  const plan = k.planLijnen({ datums: ['2027-06-08'], start: k.minuten('09:30'), einde: k.minuten('14:00'), leerkrachten: ['Van Dyck M.'] }, lessen, uren, 6);
  assert.deepEqual(plan.map(l => l.uur), [3, 4, 7]);
  assert.equal(plan[0].klas, '4B');
});

test('meerdere klassen op hetzelfde uur worden één lijn; namen tolerant vergeleken', () => {
  const lessen = [les(1, 2, 'Van de Steene S.', '5A'), les(1, 2, 'Van De Steene S.', '5B'), les(1, 2, 'Claus S .', '1A1')];
  const plan = k.planLijnen({ datums: ['2026-11-30'], start: 0, einde: 24 * 60, leerkrachten: ['van de steene s.', 'Claus S.'] }, lessen, uren);
  assert.equal(plan.length, 2);
  assert.equal(plan.find(l => l.leerkracht.startsWith('Van')).klas, '5A / 5B');
});

test('geldigheidsperiode van interimlessen en weekends worden gerespecteerd', () => {
  const lessen = [les(1, 1, 'A.', '1A', '2026-01-01', '2026-11-29'), les(1, 1, 'A.', '1B', '2026-11-30', '9999-12-31')];
  const plan = k.planLijnen({ datums: ['2026-11-30', '2026-12-05'], start: null, einde: null, leerkrachten: ['A.'] }, lessen, uren);
  assert.deepEqual(plan, [{ datum: '2026-11-30', uur: 1, leerkracht: 'A.', klas: '1B' }]);
});

test('activiteit: deelnemende klassen hebben geen vervanging nodig, vertrekuren verbreden het venster', () => {
  const rij = { DatumActiviteit: '10-11-2026', Startuur: '9:35:00', Einduur: '11:10:00', VertrekuurHeen: '9:15:00', VertrekuurTerug: '', Begeleiders: 'Vanoverbeke E. , Vandamme C.', Klassen: '5HW' };
  const opdracht = k.opdrachtUitAanvraag('EXC', rij, '');
  assert.equal(opdracht.start, 555);
  const lessen = [les(2, 2, 'Vanoverbeke E.', '5HW'), les(2, 2, 'Vandamme C.', '3A'), les(2, 3, 'Vandamme C.', '4B'), les(2, 4, 'Vandamme C.', '4B')];
  const plan = k.planLijnen(opdracht, lessen, uren);
  assert.deepEqual(plan.map(l => [l.uur, l.leerkracht]), [[2, 'Vandamme C.'], [3, 'Vandamme C.']]);
});

test('nascholing met extra datums en duidelijke fouten bij ontbrekende gegevens', () => {
  const rij = { AanvragerEmail: 'x@y', DatumNascholing: '20-11-2026', ExtraData: '23-03-2027 , 02-06-2027', Startuur: '9:30:00', Einduur: '16:00:00' };
  assert.deepEqual(k.opdrachtUitAanvraag('NAS', rij, 'X.').datums, ['2026-11-20', '2027-03-23', '2027-06-02']);
  assert.throws(() => k.opdrachtUitAanvraag('NAS', rij, ''), /UntisNaam/);
  assert.throws(() => k.opdrachtUitAanvraag('EXC', { DatumActiviteit: '1-1-2027' }, ''), /Begeleiders/);
  assert.throws(() => k.planLijnen({ datums: ['2027-06-08'], start: 600, einde: 500, leerkrachten: ['A.'] }, [], uren), /Einduur/);
});
