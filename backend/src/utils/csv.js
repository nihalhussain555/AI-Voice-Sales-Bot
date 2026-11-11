// Dependency-free CSV reader for customer imports.
//
// Supports what real exports from spreadsheets and CRMs actually contain:
// quoted fields with embedded commas/newlines, doubled quotes as escapes,
// CRLF or LF line endings, a UTF-8 BOM, and comma/semicolon/tab delimiters
// (European Excel saves semicolon-separated by default).

const QUOTE = '"';

export function sniffDelimiter(sample) {
  const firstLine = String(sample).split(/\r?\n/)[0] || '';
  const counts = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length
  };
  // Semicolon or tab only wins when it is strictly the most frequent, so a
  // comma file with an occasional tab inside a note still parses as comma.
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
  return ',';
}

// Returns an array of rows, each an array of string cells. Blank trailing
// lines are dropped; a row of only empty cells is preserved as [] and skipped
// by callers that require a name.
export function parseCsvRows(text, delimiter = sniffDelimiter(text)) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === QUOTE) {
        if (src[i + 1] === QUOTE) { field += QUOTE; i += 1; }
        else inQuotes = false;
      } else {
        // Newlines inside quotes belong to the value, not to the record.
        field += ch;
      }
      continue;
    }

    if (ch === QUOTE && field === '') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') { continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }

  row.push(field);
  rows.push(row);

  return rows
    .map(r => r.map(c => c.trim()))
    .filter(r => r.some(c => c !== ''));
}

const HEADER_SYNONYMS = {
  name: ['name', 'fullname', 'customername', 'customer', 'contactname', 'prospect', 'contact'],
  company: ['company', 'organisation', 'organization', 'account', 'companyname', 'firm'],
  email: ['email', 'emailaddress', 'mail', 'emailaddresswork'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'tel', 'telephone', 'cell', 'contactnumber'],
  product: ['product', 'productname', 'interest', 'offering'],
  intent: ['intent', 'leadtemperature', 'temperature', 'quality'],
  pipelineStatus: ['pipelinestatus', 'status', 'stage', 'pipeline', 'funnelstage'],
  notes: ['notes', 'note', 'comment', 'comments', 'remarks', 'detail']
};

const normaliseKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Maps the header row onto lead fields. Unknown columns are reported so the UI
// can tell the user which parts of their file were ignored rather than
// silently dropping them.
export function mapHeader(headerRow) {
  const mapping = {};
  const ignored = [];
  (headerRow || []).forEach((cell, index) => {
    const key = normaliseKey(cell);
    if (!key) return;
    const field = Object.keys(HEADER_SYNONYMS).find((f) => HEADER_SYNONYMS[f].includes(key));
    if (field) {
      if (mapping[field] === undefined) mapping[field] = index;
      else ignored.push(cell); // duplicate column: first one wins
    } else {
      ignored.push(cell);
    }
  });
  return { mapping, ignored };
}

export function parseCsvTable(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return { header: [], mapping: {}, ignored: [], records: [], delimiter: sniffDelimiter(text) };
  const header = rows[0];
  const { mapping, ignored } = mapHeader(header);
  const records = rows.slice(1).map((cells, i) => ({ line: i + 2, cells, header }));
  return { header, mapping, ignored, records, delimiter: sniffDelimiter(text) };
}

export { HEADER_SYNONYMS, normaliseKey };
