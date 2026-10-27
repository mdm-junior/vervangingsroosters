# Vervangingsroosters — Atheneum Gentbrugge

Aparte website voor `mdm-junior/vervangingsroosters`.
De oorspronkelijke website onder ManuelVanDyck blijft behouden.

## Koppeling

`config.js` bevat de vijf dagtabbladen van de nieuwe Sheet.
De publicatielink in `publishedCsvBase` leest uitsluitend de vijf goedgekeurde
openbare dagtabbladen. Daarnaast leest `meldingenUrl` uitsluitend het openbare
tabblad **Meldingen** uit dezelfde nieuwe Sheet (gid 308528338).
Wijzigingen worden door Google automatisch opnieuw gepubliceerd.

Publiceer nooit het volledige werkboek: bronlessen, afwezigheidsinvoer,
verwijderde uren, leerlingaantallen en intern leerkrachtennieuws horen niet in
het publieke websitepakket. Deze repository bevat uitsluitend websitecode.

Na publicatie wordt per dag het bereik B4:G12 (woensdag B4:G9) getoond,
gevolgd door ingevulde kleine toezichten vanaf rij 16 (woensdag rij 13).
De tekst, klasaantallen, eigen groepsnamen en opmerkingen worden overgenomen
zoals het publicatiescript ze op het dagblad heeft geschreven.

Een vaste dag bekijken kan met `?dag=maandag`, `?dag=dinsdag`, enzovoort.
Zonder deze parameter kiest de website de huidige weekdag en verbergt zij
verstreken lesuren zoals de oorspronkelijke website.

## Meldingen en PDF's

Vul het tabblad **Meldingen** van de nieuwe Sheet in. De oude website en haar
bron blijven onafhankelijk. De nieuwe website neemt de bestaande regels over.

- `startdatum` en `einddatum`: periode waarin de melding geldt (inclusief).
- `startuur` en `einduur`: bijvoorbeeld `10.55` en `11.10`.
- `modus`: `split` voor rooster naast melding, `volledig` voor alleen de melding.
  Leeg betekent `split`.
- `titel` en `tekst`: optioneel.
- `pdf1`: publieke link naar de eerste PDF; met alleen deze link blijft die staan.
- `pdf2`: optionele tweede PDF, die afwisselt met de eerste.
- `timer`: wisseltijd in seconden; standaard 15, minimum 3.

Bij overlappende regels heeft de eerste actieve rij voorrang. Drive-bestanden
moeten voor de bezoekers toegankelijk zijn; de website toont de eerste pagina
via een afbeelding. Google-presentaties worden ook ondersteund. De website
controleert de actieve periode elke 30 seconden en laadt de Sheet bij de
automatische paginaverversing elke vijf minuten opnieuw.

## GitHub Pages

De repository-eigenaar schakelt Pages in via Settings → Pages → Deploy from a
branch → main → / (root). Het doeladres is:
https://mdm-junior.github.io/vervangingsroosters/
