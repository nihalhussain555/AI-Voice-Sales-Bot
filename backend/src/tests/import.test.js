// Customer CSV import: parser, validation, duplicate detection, route contract,
// plus the dashboard aggregates the redesign depends on.
//
// DATA_DIR points at a throwaway directory before the modules load, so an
// import test never touches the real src/data store.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-import-'));
process.env.DATA_DIR = DATA_DIR;
process.env.NODE_ENV = 'test';

const { sniffDelimiter, parseCsvRows, parseCsvTable } = await import('../utils/csv.js');
const { importLeads, getLeads } = await import('../models/leads.js');
const { buildAnalytics } = await import('../services/analytics.js');
const leadsRoutes = (await import('../routes/leads.routes.js')).default;
const { apiError } = await import('../middleware/error-handler.js');

const csv = (...lines) => lines.join('\r\n');
// Top-level tests run in order, and the store is a real file, so each counting
// test starts from a clean slate.
const resetStore = () => fs.writeFileSync(path.join(DATA_DIR, 'leads.json'), '[]');

after(() => fs.rmSync(DATA_DIR, { recursive: true, force: true }));

test('delimiter sniffing follows the header row, not incidental characters', () => {
  assert.equal(sniffDelimiter('name,phone\r\nA,+1'), ',');
  assert.equal(sniffDelimiter('name;phone\r\nA;+1'), ';');
  assert.equal(sniffDelimiter('name\tphone\r\nA\t+1'), '\t');
  // A tab inside one note must not flip the whole file to TSV.
  assert.equal(sniffDelimiter('name,phone,notes\r\nA,+1,has\ttab'), ',');
});

test('parser handles quotes, escaped quotes, embedded separators and a BOM', () => {
  const rows = parseCsvRows('\uFEFFname,company,notes\r\n'
    + '"Doe, Jane","Acme, Inc","line one\r\nline two"\r\n'
    + 'Sam "The Man" Lee,,\r\n'
    + ',,\r\n');
  assert.equal(rows[0][0], 'name');
  assert.deepEqual(rows[1], ['Doe, Jane', 'Acme, Inc', 'line one\r\nline two']);
  assert.equal(rows[2][0], 'Sam "The Man" Lee');
  assert.equal(rows.length, 3, 'the fully blank row is dropped');
});

test('header mapping reads common CRM and spreadsheet column spellings', () => {
  const table = parseCsvTable(csv(
    'Full Name,Organisation,E-Mail Address,Mobile,Lead Temperature,Internal Id',
    'Priya N.,Tata Digital,priya@example.com,+919876543210,Hot,x9'
  ));
  assert.equal(table.mapping.name, 0);
  assert.equal(table.mapping.company, 1);
  assert.equal(table.mapping.email, 2);
  assert.equal(table.mapping.phone, 3);
  assert.equal(table.mapping.intent, 4);
  assert.deepEqual(table.ignored, ['Internal Id'], 'unmapped columns are reported, not silently dropped');
  assert.equal(table.records[0].line, 2, 'line numbers are 1-based with the header on line 1');
});

test('importLeads splits valid, invalid and duplicate rows and writes nothing on dryRun', () => {
  resetStore();
  const records = [
    { name: 'Alpha Client', phone: '+1 (415) 555-0111', email: 'alpha@acme.com', intent: 'Hot' },
    { name: '', phone: '+14155550112' },                                  // no name
    { name: 'Bad Email', email: 'not-an-email' },                          // invalid email
    { name: 'No Contacts' },                                              // neither phone nor email
    { name: 'Tiny Phone', phone: '12345' },                                // too short to dial
    { name: 'Beta Client', phone: '0014155550111', company: 'Beta Co' },   // same digits as row 1
    { name: 'Gamma Client', email: 'GAMMA@acme.com' },
    { name: 'Alpha Again', email: 'ALPHA@acme.com' }                       // duplicate of row 1 by email
  ];

  const preview = importLeads(records, { dryRun: true });
  assert.deepEqual(
    { total: preview.total, valid: preview.valid, imported: preview.imported, invalid: preview.invalid.length, duplicates: preview.duplicates.length },
    { total: 8, valid: 2, imported: 0, invalid: 4, duplicates: 2 }
  );
  assert.equal(getLeads().length, 0, 'a preview never writes');
  assert.deepEqual(preview.invalid.map(r => r.name), ['', 'Bad Email', 'No Contacts', 'Tiny Phone']);
  assert.match(preview.invalid[2].reason, /phone number or an email/i);
  const phoneDupe = preview.duplicates.find(d => d.name === 'Beta Client');
  assert.equal(phoneDupe.matchedOn, 'phone', '001-415 and +1-415 are the same customer');
  assert.equal(preview.duplicates.find(d => d.name === 'Alpha Again').matchedOn, 'email');
});

test('a real import persists customers, and re-importing the same file finds only duplicates', () => {
  resetStore();
  const records = [
    { name: 'Priya N.', phone: '+919876543210', email: 'priya@example.com', company: 'Tata', intent: 'warm', pipelineStatus: 'contacted' },
    { name: 'Ravi K.', phone: '+14155550199', notes: 'asked for pricing' }
  ];

  const first = importLeads(records, { dryRun: false });
  assert.equal(first.imported, 2);
  assert.equal(getLeads().length, 2);
  const stored = getLeads().find(l => l.name === 'Priya N.');
  assert.equal(stored.pipelineStatus, 'Contacted', 'stage is matched case-insensitively');
  assert.equal(stored.intent, 'warm');
  assert.equal(stored.email, 'priya@example.com');
  assert.match(stored.id, /^lead-\d+-\d+$/, 'bulk ids stay unique even inside one millisecond');

  const second = importLeads(records, { dryRun: false });
  assert.equal(second.imported, 0);
  assert.equal(second.duplicates.length, 2);
  assert.equal(getLeads().length, 2, 're-import never duplicates a customer');
});

// ---- Route contract --------------------------------------------------------

async function serve() {
  const app = express();
  app.use('/api/leads', leadsRoutes);
  app.use(apiError);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

function formCsv(text, filename = 'customers.csv', type = 'text/csv') {
  const fd = new FormData();
  fd.append('file', new Blob([text], { type }), filename);
  return fd;
}

test('POST /api/leads/import previews with detected columns, then commits', async () => {
  resetStore();
  const { server, base } = await serve();
  try {
    const body = csv(
      'Name,Company,Email,Phone,Intent',
      'Neha S.,Initech,neha@initech.com,+14155550101,hot',
      'Omar F.,Globex,omar@globex.com,+14155550102,cold',
      ',Missing Name,m@x.com,+14155550103'
    );

    const preview = await fetch(`${base}/api/leads/import?dryRun=1`, { method: 'POST', body: formCsv(body) });
    const previewJson = await preview.json();
    assert.equal(preview.status, 200);
    assert.equal(previewJson.dryRun, true);
    assert.deepEqual(
      { total: previewJson.total, valid: previewJson.valid, imported: previewJson.imported, invalid: previewJson.invalid.length },
      { total: 3, valid: 2, imported: 0, invalid: 1 }
    );
    assert.equal(previewJson.fileName, 'customers.csv');
    assert.deepEqual(previewJson.mappedColumns, { name: 'Name', company: 'Company', email: 'Email', phone: 'Phone', intent: 'Intent' });
    assert.equal(previewJson.delimiter, ',');

    const commit = await fetch(`${base}/api/leads/import`, { method: 'POST', body: formCsv(body) });
    const commitJson = await commit.json();
    assert.equal(commit.status, 200);
    assert.equal(commitJson.imported, 2);
    assert.equal(commitJson.created.length, 2);

    const list = await (await fetch(`${base}/api/leads`)).json();
    assert.equal(list.leads.length, 2);

    const again = await (await fetch(`${base}/api/leads/import`, { method: 'POST', body: formCsv(body) })).json();
    assert.equal(again.imported, 0);
    assert.equal(again.duplicates.length, 2);
  } finally {
    server.close();
  }
});

test('the import endpoint refuses unusable input with an actionable status', async () => {
  resetStore();
  const { server, base } = await serve();
  try {
    const noFile = await fetch(`${base}/api/leads/import`, { method: 'POST', body: new FormData() });
    assert.equal(noFile.status, 400);

    const pdf = await fetch(`${base}/api/leads/import`, { method: 'POST', body: formCsv('a,b', 'report.pdf', 'application/pdf') });
    assert.equal(pdf.status, 415);
    assert.match((await pdf.json()).error, /csv|txt/i);

    const noNameColumn = await fetch(`${base}/api/leads/import`, { method: 'POST', body: formCsv(csv('Contact Number,Notes', '+14155550101,call after 5')) });
    assert.equal(noNameColumn.status, 422);
    const err = await noNameColumn.json();
    assert.match(err.error, /name column/i);
    assert.deepEqual(err.detectedColumns, ['Contact Number', 'Notes']);

    const empty = await fetch(`${base}/api/leads/import`, { method: 'POST', body: formCsv('') });
    assert.equal(empty.status, 400);

    assert.equal((await (await fetch(`${base}/api/leads`)).json()).leads.length, 0, 'nothing was imported');
  } finally {
    server.close();
  }
});

test('analytics counts distinct customers, successful and failed attempts, and turns', () => {
  const now = new Date().toISOString();
  const calls = [
    { id: '1', timestamp: now, channel: 'phone', outcome: 'completed', to: '+14155550101', customerName: 'A', duration: 60, status: 'Interested', transcript: [{ sender: 'bot', text: 'x' }, { sender: 'customer', text: 'y' }], summary: { dealScore: 70 } },
    { id: '2', timestamp: now, channel: 'phone', outcome: 'completed', to: '+1 (415) 555-0101', customerName: 'A again', duration: 30, status: 'Converted', transcript: [{ sender: 'bot', text: 'x' }], summary: { dealScore: 90 } },
    { id: '3', timestamp: now, channel: 'phone', outcome: 'busy', to: '+14155550102', customerName: 'B', duration: 0, status: 'No Response', transcript: [], summary: { dealScore: 0 } },
    { id: '4', timestamp: now, channel: 'browser', customerName: 'C', email: 'C@Example.com', duration: 12, status: 'Interested', transcript: [{ sender: 'bot', text: 'a' }, { sender: 'customer', text: 'b' }, { sender: 'bot', text: 'c' }], summary: { dealScore: 55 } }
  ];
  const totals = buildAnalytics({ calls }).totals;
  assert.deepEqual(
    { customers: totals.customers, successful: totals.successful, failed: totals.failed, turns: totals.conversationTurns },
    { customers: 3, successful: 3, failed: 1, turns: 6 },
    'the same dialled number twice is one customer'
  );
});
