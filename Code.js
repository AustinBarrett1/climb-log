/**
 * Climb Log — Google Apps Script backend
 *
 * Paste this into Extensions → Apps Script of a Google Sheet (replace the
 * default Code.gs), add an HTML file named "Index" with Index.html, run
 * setup() once, then Deploy → New deployment → Web app.
 */

// ====== EDIT THIS ======
const CLIMBERS = ['Austin', 'Abbie'];   // ← replace 'Partner' with your girlfriend's name
// =======================

const SHEET_NAME = 'Climbs';
const PHOTO_FOLDER_NAME = 'Climb Log Photos';
const HEADERS = [
  'ID', 'Logged At', 'Date', 'Climber', 'Climb Type', 'Setting', 'Location',
  'Route Name', 'Grade', 'Result', 'Attempts', 'Falls', 'Rating',
  'Wall / Colour', 'Notes', 'Photo IDs'
];
const COL = {};
HEADERS.forEach(function (h, i) { COL[h] = i + 1; });

// ---------- Web app ----------

function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.config = JSON.stringify({ climbers: CLIMBERS });
  return t.evaluate()
    .setTitle('Climb Log')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Climb Log')
    .addItem('Set up sheet & photo folder', 'setup')
    .addToUi();
}

/** Run once from the Apps Script editor to create the sheet and photo folder. */
function setup() {
  getSheet_();
  const folder = getPhotoFolder_();
  Logger.log('Ready. Photos folder: ' + folder.getUrl());
  return 'Ready';
}

// ---------- API called from the page ----------

function getClimbs() {
  const sh = getSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  return vals.filter(function (r) { return r[0]; }).map(rowToClimb_);
}

/** Saves one row per climber (so you can log a climb you both did in one go). */
function saveClimbs(p) {
  validate_(p);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_();
    const now = new Date();
    const rows = p.entries.map(function (e) { return buildRow_(Utilities.getUuid(), now, p, e); });
    writeRows_(sh, sh.getLastRow() + 1, rows);
    return rows.length;
  } finally {
    lock.releaseLock();
  }
}

function updateClimb(id, p) {
  validate_(p);
  if (p.entries.length !== 1) throw new Error('Edit one climber at a time');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_();
    const row = findRow_(sh, id);
    if (!row) throw new Error('Climb not found (maybe it was deleted)');
    const old = sh.getRange(row, 1, 1, HEADERS.length).getValues()[0];
    const oldPhotos = splitIds_(old[COL['Photo IDs'] - 1]);
    writeRows_(sh, row, [buildRow_(id, old[COL['Logged At'] - 1] || new Date(), p, p.entries[0])]);
    const keep = p.photoIds || [];
    trashUnusedPhotos_(sh, oldPhotos.filter(function (x) { return keep.indexOf(x) < 0; }));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function deleteClimb(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_();
    const row = findRow_(sh, id);
    if (!row) return false;
    const photos = splitIds_(sh.getRange(row, COL['Photo IDs']).getValue());
    sh.deleteRow(row);
    trashUnusedPhotos_(sh, photos);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** Receives a compressed JPEG data URL from the page and saves it to Drive. */
function uploadPhoto(dataUrl, name) {
  const m = String(dataUrl).match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!m) throw new Error('That file is not an image');
  const fileName = 'climb_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') +
    '_' + String(name || 'photo').replace(/[^\w.-]/g, '').slice(0, 40);
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], fileName);
  const file = getPhotoFolder_().createFile(blob);
  // Link-viewable so thumbnails load in the app for both of you.
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return file.getId();
}

/** Called when a photo is removed from the form before it was ever saved. */
function discardPhoto(id) {
  trashUnusedPhotos_(getSheet_(), [id]);
  return true;
}

// ---------- Helpers ----------

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME, 0);
  if (sh.getRange(1, 1).getValue() !== 'ID') {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold').setBackground('#1a2129').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    // Keep dates and grades as text so Sheets doesn't turn "5.10" into 5.1
    sh.getRange(1, COL['Date'], sh.getMaxRows(), 1).setNumberFormat('@');
    sh.getRange(1, COL['Grade'], sh.getMaxRows(), 1).setNumberFormat('@');
  }
  return sh;
}

function getPhotoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) {}
  }
  const folder = DriveApp.createFolder(PHOTO_FOLDER_NAME);
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function buildRow_(id, loggedAt, p, e) {
  return [
    id, loggedAt, p.date, e.climber, clean_(p.type), clean_(p.setting), clean_(p.location),
    clean_(p.route), clean_(p.grade), clean_(e.result), toInt_(e.attempts, 1), toInt_(e.falls, 0),
    toInt_(p.rating, 0), clean_(p.wall), clean_(p.notes, 2000), (p.photoIds || []).join(',')
  ];
}

function writeRows_(sh, startRow, rows) {
  const needed = startRow + rows.length - 1;
  if (needed > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), needed - sh.getMaxRows() + 200);
  sh.getRange(startRow, COL['Date'], rows.length, 1).setNumberFormat('@');
  sh.getRange(startRow, COL['Grade'], rows.length, 1).setNumberFormat('@');
  sh.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
}

function rowToClimb_(r) {
  const tz = Session.getScriptTimeZone();
  const fmt = function (v, pattern) {
    return v instanceof Date ? Utilities.formatDate(v, tz, pattern) : String(v || '');
  };
  const g = function (h) { return r[COL[h] - 1]; };
  return {
    id: String(g('ID')),
    loggedAt: fmt(g('Logged At'), "yyyy-MM-dd'T'HH:mm:ss"),
    date: fmt(g('Date'), 'yyyy-MM-dd'),
    climber: String(g('Climber')),
    type: String(g('Climb Type')),
    setting: String(g('Setting')),
    location: String(g('Location')),
    route: String(g('Route Name')),
    grade: String(g('Grade')),
    result: String(g('Result')),
    attempts: Number(g('Attempts')) || 0,
    falls: Number(g('Falls')) || 0,
    rating: Number(g('Rating')) || 0,
    wall: String(g('Wall / Colour')),
    notes: String(g('Notes')),
    photoIds: splitIds_(g('Photo IDs'))
  };
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

/** Trash photos that no remaining row refers to (photos can be shared by both climbers' rows). */
function trashUnusedPhotos_(sh, ids) {
  if (!ids || !ids.length) return;
  const last = sh.getLastRow();
  const used = {};
  if (last >= 2) {
    sh.getRange(2, COL['Photo IDs'], last - 1, 1).getValues().forEach(function (r) {
      splitIds_(r[0]).forEach(function (x) { used[x] = true; });
    });
  }
  ids.forEach(function (id) {
    if (used[id]) return;
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {}
  });
}

function validate_(p) {
  if (!p || !Array.isArray(p.entries) || !p.entries.length) throw new Error('Pick who climbed it');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.date))) throw new Error('Invalid date');
  p.entries.forEach(function (e) {
    if (CLIMBERS.indexOf(e.climber) < 0) throw new Error('Unknown climber: ' + e.climber);
  });
}

function splitIds_(v) {
  return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(String);
}

function toInt_(v, dflt) {
  const n = parseInt(v, 10);
  return isNaN(n) || n < 0 ? dflt : n;
}

/** Trim, cap length, and stop text from being treated as a formula. */
function clean_(v, max) {
  let s = String(v == null ? '' : v).trim().slice(0, max || 300);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
