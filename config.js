// Publicatie van de vijf dagtabbladen en het afzonderlijke blad Meldingen.
// Leegmaken schakelt het ophalen van roostergegevens uit.
window.ROOSTER_CONFIG = Object.freeze({
    publishedCsvBase: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwLAU7EIWZYbzqEVPbDYYpbuQcE8WVIMLaqWRA4l43QFnpnX13H7svhuxExhydH3_VuG3o4NtUGIoK/pub',
    meldingenUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwLAU7EIWZYbzqEVPbDYYpbuQcE8WVIMLaqWRA4l43QFnpnX13H7svhuxExhydH3_VuG3o4NtUGIoK/pub?gid=308528338&single=true&output=csv',
    schedules: {
        1: { gid: '0', label: 'Maandag', range: { startRow: 4, endRow: 12, startCol: 1, endCol: 6 }, supervisionHeaderRow: 15 },
        2: { gid: '603990815', label: 'Dinsdag', range: { startRow: 4, endRow: 12, startCol: 1, endCol: 6 }, supervisionHeaderRow: 15 },
        3: { gid: '1502738774', label: 'Woensdag', range: { startRow: 4, endRow: 9, startCol: 1, endCol: 6 }, supervisionHeaderRow: 12 },
        4: { gid: '581950876', label: 'Donderdag', range: { startRow: 4, endRow: 12, startCol: 1, endCol: 6 }, supervisionHeaderRow: 15 },
        5: { gid: '1113008131', label: 'Vrijdag', range: { startRow: 4, endRow: 12, startCol: 1, endCol: 6 }, supervisionHeaderRow: 15 },
    },
});
