/**
 * Staff Directory backend
 * Sheet holds the details, Drive holds the photos, the app reads both back.
 *
 * SET UP
 * 1. Open a new Google Sheet, Extensions > Apps Script, paste this file in.
 * 2. Deploy > New deployment > Web app.
 *    Execute as: Me.  Who has access: Anyone.
 * 3. Copy the /exec URL and paste it into SCRIPT_URL in index.html.
 *
 * The sheet tab and the Drive folder are created on the first save.
 *
 * WHAT CHANGED IN THIS VERSION
 * a. An Email column, and a forgot action: when the address typed in the app
 *    matches the Email column of that record, the password is emailed to it
 *    with a do not reply line. Needs the MailApp permission, so accept the
 *    prompt the first time you deploy this version.
 * b. An Access column holds the NMDR tabs each staff member may open, written
 *    by the Access tab, and doGet?action=accesscsv hands back access.csv.
 * c. A Password column holds the password each staff member creates on the form.
 * d. A removal password is checked here as well as in the page, so a delete
 *    that reaches this script without it is refused.
 * e. Columns are found by their heading rather than by a fixed number, and any
 *    heading that is missing from an older sheet is added on the next call, so
 *    a sheet already holding records keeps every row exactly where it is.
 *
 * AFTER PASTING THIS IN
 * Deploy > Manage deployments > edit the existing deployment > Version: New
 * version > Deploy. The URL stays the same, so nothing changes in the page.
 */

var SHEET_NAME  = 'Staff';
var FOLDER_NAME = 'Staff Directory Photos';

/* must match REMOVE_PASSWORD in index.html */
var REMOVE_PASSWORD = 'Mohamed@1995';

/* set to false to stop this script sending a staff password back to any caller */
var ALLOW_PASSWORD_READ = false;

var HEADERS = [
  'ID','Saved At','Name','Designation','Level Rank','Level',
  'Place of Work','Telephone','Address','Email','Password','Access','Access Set At',
  'Photo File ID','Photo URL','Deleted'
];

/* ---------------- entry points ---------------- */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'list';
  try {
    if (action === 'list')   return json({ ok: true, records: listRecords() });
    if (action === 'ping')   return json({ ok: true, message: 'Staff Directory backend is running' });
    if (action === 'accesscsv') return csv(accessCsv());
    return json({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'The request body was not readable JSON' });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var action = body.action || 'save';
    if (action === 'save')   return json(saveRecord(body.record || {}));
    if (action === 'delete') return json(deleteRecord(body.id, body.password));
    if (action === 'list')   return json({ ok: true, records: listRecords() });
    if (action === 'login')  return json(checkStaffPassword(body.id, body.phone, body.password));
    if (action === 'access') return json(saveAccess(body.id, body.tabs));
    if (action === 'forgot') return json(sendForgottenPassword(body.id, body.email));
    return json({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* ---------------- actions ---------------- */

function saveRecord(r) {
  if (!r.id)   return { ok: false, error: 'The record has no id' };
  if (!r.name) return { ok: false, error: 'The record has no name' };

  var phone = String(r.phone == null ? '' : r.phone).trim();
  if (!/^[0-9]{9}$/.test(phone)) {
    return { ok: false, error: 'The telephone number must be exactly 9 digits, digits only, with no plus sign or spaces. This record carries "' + phone + '".' };
  }

  var sheet = getSheet();
  var map   = colMap(sheet);
  var width = sheet.getLastColumn();
  var row   = findRow(sheet, r.id, map);

  /* start from the row already on the sheet, so anything this save does not
     carry (a photo, a password) stays as it was instead of being wiped */
  var values = row > 0
    ? sheet.getRange(row, 1, 1, width).getValues()[0]
    : blankRow(width);

  function put(heading, value) {
    var c = map[heading];
    if (c) values[c - 1] = value;
  }

  put('ID', r.id);
  put('Saved At', r.saved || new Date().toISOString());
  put('Name', r.name);
  put('Designation', r.designation || '');
  put('Level Rank', r.rank || '');
  put('Level', r.levelLabel || (r.rank ? 'Grade ' + r.rank : ''));
  put('Place of Work', r.place || '');
  put('Telephone', phone);
  put('Address', r.address || '');
  if (r.email != null) put('Email', String(r.email).trim());
  put('Deleted', '');

  if (r.password) put('Password', String(r.password));
  if (r.access != null) put('Access', String(r.access));

  var photoUrl = map['Photo URL'] ? String(values[map['Photo URL'] - 1] || '') : '';
  var fileId   = map['Photo File ID'] ? String(values[map['Photo File ID'] - 1] || '') : '';

  if (r.photo) {
    var saved = savePhoto(r.photo, r.name, r.id);
    fileId = saved.id;
    photoUrl = saved.url;
    put('Photo File ID', fileId);
    put('Photo URL', photoUrl);
  }

  if (row > 0) {
    sheet.getRange(row, 1, 1, width).setValues([values]);
  } else {
    sheet.appendRow(values);
  }

  return { ok: true, id: r.id, photoUrl: photoUrl, fileId: fileId };
}

function listRecords() {
  var sheet = getSheet();
  var last = sheet.getLastRow();
  if (last < 2) return [];

  var map = colMap(sheet);
  var width = sheet.getLastColumn();
  var rows = sheet.getRange(2, 1, last - 1, width).getValues();
  var out = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];

    function get(heading) {
      var c = map[heading];
      return c ? r[c - 1] : '';
    }

    if (String(get('Deleted')).toLowerCase() === 'yes') continue;
    if (!get('ID')) continue;

    var pass = String(get('Password') || '');

    var rec = {
      id: String(get('ID')),
      saved: get('Saved At') ? String(get('Saved At')) : '',
      name: String(get('Name')),
      designation: String(get('Designation')),
      rank: Number(get('Level Rank')) || 0,
      levelLabel: String(get('Level')),
      place: String(get('Place of Work')),
      phone: String(get('Telephone')),
      address: String(get('Address')),
      fileId: String(get('Photo File ID')),
      photoUrl: String(get('Photo URL')),
      email: String(get('Email') || ''),
      access: String(get('Access') || ''),
      accessSetAt: String(get('Access Set At') || ''),
      hasPassword: pass ? true : false
    };

    /* the password is not sent to the page by default, it only sits on the sheet */
    if (ALLOW_PASSWORD_READ) rec.password = pass;

    out.push(rec);
  }
  return out;
}

function deleteRecord(id, password) {
  if (!id) return { ok: false, error: 'No id was sent' };

  if (String(password || '') !== REMOVE_PASSWORD) {
    return { ok: false, error: 'The removal password is wrong or missing, so nothing was removed.' };
  }

  var sheet = getSheet();
  var map = colMap(sheet);
  var row = findRow(sheet, id, map);
  if (row < 1) return { ok: true, id: id, message: 'Not on the sheet, nothing to remove' };

  var fileCol = map['Photo File ID'];
  if (fileCol) {
    var fileId = sheet.getRange(row, fileCol).getValue();
    if (fileId) {
      try { DriveApp.getFileById(fileId).setTrashed(true); } catch (ignore) {}
    }
  }
  sheet.deleteRow(row);
  return { ok: true, id: id };
}

/* checks a staff member's own password, for a later sign in screen.
   Answers with the person, never with the stored password. */
function checkStaffPassword(id, phone, password) {
  if (!password) return { ok: false, error: 'No password was sent' };

  var sheet = getSheet();
  var map = colMap(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return { ok: false, error: 'No staff are registered yet' };

  var width = sheet.getLastColumn();
  var rows = sheet.getRange(2, 1, last - 1, width).getValues();

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var rid   = map['ID'] ? String(r[map['ID'] - 1]) : '';
    var rph   = map['Telephone'] ? String(r[map['Telephone'] - 1]) : '';
    var rpass = map['Password'] ? String(r[map['Password'] - 1]) : '';
    var match = (id && rid === String(id)) || (phone && rph === String(phone));
    if (!match) continue;
    if (rpass && rpass === String(password)) {
      return {
        ok: true,
        id: rid,
        name: map['Name'] ? String(r[map['Name'] - 1]) : '',
        place: map['Place of Work'] ? String(r[map['Place of Work'] - 1]) : '',
        levelLabel: map['Level'] ? String(r[map['Level'] - 1]) : ''
      };
    }
    return { ok: false, error: 'That password does not match this staff member' };
  }
  return { ok: false, error: 'No staff member was found for that id or telephone number' };
}

/* writes the tab list the Access tab ticked for one staff member.
   tabs arrives as one string, tab ids separated by a semicolon. */
function saveAccess(id, tabs) {
  if (!id) return { ok: false, error: 'No id was sent' };

  var sheet = getSheet();
  var map = colMap(sheet);
  var row = findRow(sheet, id, map);
  if (row < 1) return { ok: false, error: 'No record on the sheet carries the id ' + id };

  var clean = String(tabs == null ? '' : tabs)
                .split(';')
                .map(function(t){ return String(t).trim(); })
                .filter(function(t){ return t !== ''; })
                .join(';');

  if (map['Access']) sheet.getRange(row, map['Access']).setValue(clean);
  if (map['Access Set At']) sheet.getRange(row, map['Access Set At']).setValue(new Date().toISOString());

  return { ok: true, id: id, tabs: clean, count: clean ? clean.split(';').length : 0 };
}

/* access.csv, exactly as the NMDR index reads it.
   One row per staff member who has at least one tab. */
function accessCsv() {
  var sheet = getSheet();
  var last = sheet.getLastRow();
  var rows = ['ID,Name,Telephone,Place of Work,Level,Password,Tabs'];
  if (last < 2) return rows.join('\n');

  var map = colMap(sheet);
  var width = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, last - 1, width).getValues();

  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    function g(h){ return map[h] ? r[map[h] - 1] : ''; }
    if (String(g('Deleted')).toLowerCase() === 'yes') continue;
    if (!g('ID')) continue;
    var tabs = String(g('Access') || '').trim();
    if (!tabs) continue;
    rows.push([
      cell(g('ID')), cell(g('Name')), cell(g('Telephone')), cell(g('Place of Work')),
      cell(g('Level')), cell(g('Password')), cell(tabs)
    ].join(','));
  }
  return rows.join('\n');
}

function cell(v) {
  return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
}

/* ================= FORGOTTEN PASSWORD =================
   The address typed in the app is compared with the Email column of that
   record. Only on a match is the password emailed, and only to the address
   already on the sheet, never to the one typed. Nothing about the record is
   handed back to the page, so a wrong guess learns nothing. */
function sendForgottenPassword(id, typed) {
  if (!id)    return { ok: false, error: 'No record was named.' };
  if (!typed) return { ok: false, error: 'No email address was sent.' };

  var sheet = getSheet();
  var map = colMap(sheet);
  var row = findRow(sheet, id, map);
  if (row < 1) return { ok: false, error: 'That record is not on the sheet yet. Use Sync now first.' };

  function cellOf(heading){
    return map[heading] ? String(sheet.getRange(row, map[heading]).getValue() || '').trim() : '';
  }

  var onFile = cellOf('Email');
  var pass   = cellOf('Password');
  var name   = cellOf('Name');

  if (!onFile){
    return { ok: false, error: 'No email address is on file for this staff member, so nothing can be sent. Save the record again with an email address.' };
  }
  if (onFile.toLowerCase() !== String(typed).trim().toLowerCase()){
    return { ok: false, error: 'That is not the email address on file for this staff member.' };
  }
  if (!pass){
    return { ok: false, error: 'No password is on file for this staff member, so there is nothing to send.' };
  }

  var body = 'Dear ' + (name || 'colleague') + ',\n\n'
           + 'Your NMDR password is: ' + pass + '\n\n'
           + 'Use it with your telephone number on the NMDR sign in screen.\n\n'
           + 'Do not reply to this email.\n';

  try {
    MailApp.sendEmail({
      to: onFile,
      subject: 'Your NMDR password',
      body: body,
      name: 'NMDR Staff Directory'
    });
  } catch (err) {
    return { ok: false, error: 'The email could not be sent: ' + String(err) };
  }

  return { ok: true, id: id };
}

/* ---------------- helpers ---------------- */

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  ensureColumns(sheet);
  styleHeader(sheet);
  return sheet;
}

/* adds any heading this script expects but the sheet does not have yet.
   New headings go on the end, so the rows already saved do not move. */
function ensureColumns(sheet) {
  var width = Math.max(sheet.getLastColumn(), 1);
  var row = sheet.getRange(1, 1, 1, width).getValues()[0];
  var have = {};
  for (var i = 0; i < row.length; i++) have[String(row[i]).trim()] = true;

  var missing = [];
  for (var j = 0; j < HEADERS.length; j++) {
    if (!have[HEADERS[j]]) missing.push(HEADERS[j]);
  }
  if (!missing.length) return;

  var start = (String(row[0]).trim() === '') ? 1 : width + 1;
  sheet.getRange(1, start, 1, missing.length).setValues([missing]);
}

function styleHeader(sheet) {
  var width = sheet.getLastColumn();
  if (!width) return;
  sheet.getRange(1, 1, 1, width)
       .setFontWeight('bold')
       .setBackground('#004080')
       .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

/* heading to column number, read from the sheet itself */
function colMap(sheet) {
  var width = sheet.getLastColumn();
  var map = {};
  if (!width) return map;
  var row = sheet.getRange(1, 1, 1, width).getValues()[0];
  for (var i = 0; i < row.length; i++) {
    var key = String(row[i]).trim();
    if (key && !map[key]) map[key] = i + 1;
  }
  return map;
}

function blankRow(width) {
  var a = [];
  for (var i = 0; i < width; i++) a.push('');
  return a;
}

function findRow(sheet, id, map) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var idCol = (map && map['ID']) ? map['ID'] : 1;
  var ids = sheet.getRange(2, idCol, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function getFolder() {
  var found = DriveApp.getFoldersByName(FOLDER_NAME);
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME);
}

function savePhoto(dataUrl, name, id) {
  var parts = String(dataUrl).split(',');
  var meta = parts[0] || '';
  var b64 = parts.length > 1 ? parts[1] : parts[0];
  var type = (meta.match(/data:([^;]+);/) || [null, 'image/jpeg'])[1];
  var ext = type.indexOf('png') > -1 ? 'png' : 'jpg';

  var safe = String(name).replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, '_');
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), type, safe + '_' + id + '.' + ext);

  var folder = getFolder();

  /* replace an older photo for the same person */
  var existing = folder.getFilesByName(blob.getName());
  while (existing.hasNext()) existing.next().setTrashed(true);

  var file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (ignore) {}

  return {
    id: file.getId(),
    url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w640'
  };
}

function csv(text) {
  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.CSV);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- one off checks, run from the editor ---------------- */

/* Run this once after pasting the file in. It creates or repairs the
   header row and tells you which column each heading landed in. */
function setUpSheet() {
  var sheet = getSheet();
  var map = colMap(sheet);
  var lines = [];
  for (var i = 0; i < HEADERS.length; i++) {
    lines.push(HEADERS[i] + ' = column ' + (map[HEADERS[i]] || 'MISSING'));
  }
  Logger.log('Sheet: ' + SHEET_NAME + ', rows of data: ' + Math.max(sheet.getLastRow() - 1, 0));
  Logger.log(lines.join('\n'));
}
