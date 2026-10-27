# Vervangingsroosters — Atheneum Gentbrugge

Aparte website voor `mdm-junior/vervangingsroosters`.
De oorspronkelijke website onder ManuelVanDyck blijft behouden.

## Koppeling

`config.js` bevat de vijf dagtabbladen van de nieuwe Sheet.
De publicatielink in `publishedCsvBase` leest uitsluitend de vijf goedgekeurde
openbare dagtabbladen. Wijzigingen worden door Google automatisch opnieuw gepubliceerd.

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

De oude meldingenbron is niet overgenomen. Een eigen meldingenbron kan later
via `meldingenUrl` worden ingesteld.

## GitHub Pages

De repository-eigenaar schakelt Pages in via Settings → Pages → Deploy from a
branch → main → / (root). Het doeladres is:
https://mdm-junior.github.io/vervangingsroosters/
