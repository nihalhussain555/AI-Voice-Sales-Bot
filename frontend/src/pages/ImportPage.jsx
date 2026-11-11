import React, { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileSpreadsheet, UploadCloud, Check, XCircle, Copy, Users, Loader2,
  ArrowLeft, FileDown, AlertTriangle, PhoneOff
} from 'lucide-react';

import { api } from '../services/api.js';
import Page from '../components/shell/Page.jsx';
import { PageHeader, SectionHeader } from '../components/ui/page-header.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { HintText } from '../components/ui/input.jsx';
import { StatCard } from '../components/ui/stat-card.jsx';
import { ProgressBar } from '../components/ui/progress.jsx';
import { Table, Td, Th, THead, Tr } from '../components/ui/table.jsx';
import { ErrorState } from '../components/ui/empty-state.jsx';
import { useToast } from '../components/ui/toast.jsx';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ['.csv', '.tsv', '.txt'];
const TEMPLATE = [
  'name,company,email,phone,product,intent,pipelineStatus,notes',
  'Priya Nair,Northwind Retail,priya@northwind.example,+14155550111,DevPulse AI,hot,Qualified,Budget approved for Q1',
  'Rahul Verma,Kirana Digital,rahul@kirana.example,+919876543210,OmniLeads CRM,warm,New,Wants a demo after the launch'
].join('\r\n');

// Column labels the backend recognises, surfaced so a mismatch is obvious
// before anyone uploads.
const EXPECTED_COLUMNS = ['name', 'company', 'email', 'phone', 'product', 'intent', 'pipelineStatus', 'notes'];

const formatBytes = (n = 0) => (n > 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const accepts = (file) => ACCEPT.some(ext => file.name.toLowerCase().endsWith(ext))
  || (file.type || '').startsWith('text/');

export default function ImportPage() {
  const { push: toast } = useToast();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState('pick'); // pick | analysing | preview | importing | done
  const [preview, setPreview] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState(null);
  const [localError, setLocalError] = useState('');

  const analyse = useCallback(async (chosen) => {
    setFile(chosen);
    setPreview(null);
    setOutcome(null);
    setError(null);
    setLocalError('');
    if (!accepts(chosen)) {
      setLocalError(`${chosen.name} is not a CSV, TSV or TXT file.`);
      setPhase('pick');
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setLocalError(`${chosen.name} is ${formatBytes(chosen.size)} — the limit is 5 MB.`);
      setPhase('pick');
      return;
    }
    setPhase('analysing');
    try {
      const data = await api.importCustomers(chosen, { dryRun: true });
      setPreview(data);
      setPhase('preview');
    } catch (err) {
      setError(err);
      setPhase('preview');
    }
  }, []);

  const commit = useCallback(async () => {
    setPhase('importing');
    setError(null);
    try {
      const data = await api.importCustomers(file, { dryRun: false });
      setOutcome(data);
      setPhase('done');
      toast(`${data.imported} ${data.imported === 1 ? 'customer' : 'customers'} imported`, 'success');
    } catch (err) {
      setError(err);
      setPhase('preview');
      toast(`Import failed: ${err.message}`, 'error');
    }
  }, [file, toast]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setOutcome(null);
    setError(null);
    setLocalError('');
    setPhase('pick');
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) analyse(dropped);
  };

  const mapped = preview?.mappedColumns || {};

  return (
    <Page className="max-w-4xl">
      <PageHeader
        description="Load an existing contact list into the customer database. Rows are checked against the same rules the import itself uses, so the numbers below are exactly what will be written."
        meta={phase === 'done'
          ? <Badge variant="success" dot>{outcome?.imported} imported</Badge>
          : <Badge variant="slate" dot>Nothing is dialled automatically</Badge>}
        actions={phase !== 'pick' && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <ArrowLeft className="w-3.5 h-3.5" /> {phase === 'done' ? 'Import another file' : 'Choose another file'}
          </Button>
        )}
      />

      <div className="rounded-card border border-line bg-surface-3/40 px-4 py-3 mb-5 flex items-start gap-3">
        <PhoneOff className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-ink-muted leading-relaxed">
          Importing only adds contacts to <Link to="/customers" className="text-primary hover:text-primary-hover font-semibold">Customers</Link>.
          The agent never calls anyone by itself — every call starts from the
          <Link to="/agent" className="text-primary hover:text-primary-hover font-semibold"> Voice Agent </Link>
          page, one number at a time.
        </p>
      </div>

      {phase === 'pick' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-card border-2 border-dashed transition-colors duration-200 text-center px-6 py-14
            ${dragging ? 'border-primary bg-primary/10' : 'border-line-strong/70 bg-surface hover:border-primary/60'}`}
        >
          <span className="inline-flex w-12 h-12 rounded-full bg-primary/15 text-primary items-center justify-center mb-4">
            <UploadCloud className="w-6 h-6" />
          </span>
          <p className="text-sm font-bold text-ink">Drop your customer file here</p>
          <p className="text-xs text-ink-muted mt-1.5 max-w-md mx-auto leading-relaxed">
            CSV, TSV or TXT up to 5 MB. A header row is required — the columns can be named anything reasonable
            (for example “Full name” or “Mobile”), and extra columns are ignored.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => inputRef.current?.click()}><FileDown className="w-3.5 h-3.5" /> Browse files</Button>
            <Button variant="outline" onClick={downloadTemplate}><FileSpreadsheet className="w-3.5 h-3.5" /> Download template</Button>
          </div>
          {localError && (
            <p className="text-xs text-danger mt-4 inline-flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> {localError}
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT.join(',')}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && analyse(e.target.files[0])}
          />
        </div>
      )}

      {phase === 'analysing' && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm font-semibold text-ink">Checking {file?.name}</p>
            <ProgressBar indeterminate tone="primary" className="max-w-xs" />
          </CardContent>
        </Card>
      )}

      {phase === 'preview' && error && (
        <ErrorState
          title="That file could not be read"
          message={errorHint(error)}
          onRetry={() => analyse(file)}
        />
      )}

      {phase === 'preview' && !error && preview && (
        <div className="space-y-5">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-success/15 text-success flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">{preview.fileName}</p>
                    <p className="text-[11px] text-ink-muted">
                      {formatBytes(file.size)} · {preview.delimiter === ',' ? 'comma separated' : preview.delimiter === '\t' ? 'tab separated' : `"${preview.delimiter}" separated`} · read as a preview, nothing saved yet
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={reset}>Replace file</Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={Users} label="Rows read" value={preview.total} tint="muted" />
                <StatCard icon={Check} label="Ready to import" value={preview.valid} tint="success" />
                <StatCard icon={Copy} label="Already existing" value={preview.duplicates.length} tint="warn" hint="Skipped, not overwritten" />
                <StatCard icon={XCircle} label="Invalid rows" value={preview.invalid.length} tint="danger" />
              </div>

              <ColumnMapping mapped={mapped} ignored={preview.ignoredColumns} />

              {preview.truncated > 0 && (
                <p className="text-[11px] text-warn flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Only the first 5000 rows are imported — {preview.truncated} rows in this file will be left out.
                </p>
              )}
            </CardContent>
          </Card>

          {preview.sample.length > 0 && (
            <div>
              <SectionHeader
                title="Preview of the first rows"
                description="Exactly what will be written, after validation and de-duplication."
              />
              <Table>
                <THead><tr>
                  <Th>Name</Th><Th>Company</Th><Th>Phone</Th><Th>Email</Th><Th>Stage</Th>
                </tr></THead>
                <tbody>
                  {preview.sample.map((r, i) => (
                    <Tr key={i}>
                      <Td className="text-sm font-semibold text-ink whitespace-nowrap">{r.name}</Td>
                      <Td className="text-xs">{r.company || '—'}</Td>
                      <Td className="text-xs font-mono">{r.phone || '—'}</Td>
                      <Td className="text-xs">{r.email || '—'}</Td>
                      <Td><Badge variant="primary">{r.pipelineStatus}</Badge></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              {preview.valid > preview.sample.length && (
                <HintText className="mt-2">
                  Plus {preview.valid - preview.sample.length} more valid {preview.valid - preview.sample.length === 1 ? 'row' : 'rows'} not shown.
                </HintText>
              )}
            </div>
          )}

          <IssueList
            title="Invalid rows"
            tone="danger"
            icon={XCircle}
            items={preview.invalid}
            emptyMessage="Every row passed validation."
            describe={(r) => r.reason}
          />
          <IssueList
            title="Already in the customer list"
            tone="warn"
            icon={Copy}
            items={preview.duplicates}
            emptyMessage="No contact in this file matches someone you already have."
            describe={(r) => `${r.reason} (matched on ${r.matchedOn})`}
          />

          <Card variant="inset">
            <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">
                  {preview.valid > 0 ? `Import ${preview.valid} ${preview.valid === 1 ? 'customer' : 'customers'}?` : 'Nothing to import'}
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  {preview.valid > 0
                    ? `${preview.invalid.length + preview.duplicates.length} row(s) will be skipped. This cannot be undone from the app — delete customers individually afterwards.`
                    : 'Fix the file or pick a different one.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
                <Button size="sm" disabled={preview.valid === 0} onClick={commit}>
                  <UploadCloud className="w-3.5 h-3.5" /> Import customers
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {phase === 'importing' && preview && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm font-semibold text-ink">Writing {preview.valid} customers…</p>
            <ProgressBar indeterminate tone="success" className="max-w-xs" />
          </CardContent>
        </Card>
      )}

      {phase === 'done' && outcome && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                <Check className="w-5 h-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-ink">{outcome.imported} {outcome.imported === 1 ? 'customer' : 'customers'} added</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {outcome.invalid.length} invalid and {outcome.duplicates.length} duplicate row(s) were skipped.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/customers"><Button size="sm">Go to customers</Button></Link>
              <Button variant="outline" size="sm" onClick={reset}>Import another file</Button>
            </div>
            <HintText>Stage, intent and notes are editable per customer on the Customers page.</HintText>
          </CardContent>
        </Card>
      )}
    </Page>
  );
}

function ColumnMapping({ mapped, ignored = [] }) {
  const entries = EXPECTED_COLUMNS
    .map(field => ({ field, column: mapped[field] }))
    .filter(e => e.column);
  return (
    <div className="rounded-field border border-line bg-surface-3/50 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Columns used</span>
        {ignored.length > 0 && (
          <span className="text-[11px] text-ink-muted">· {ignored.length} ignored</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(({ field, column }) => (
          <span key={field} className="inline-flex items-center gap-1.5 text-[11px] rounded-full border border-line bg-surface px-2 py-1">
            <span className="font-bold text-ink">{field}</span>
            <span className="text-ink-muted">←</span>
            <span className="text-ink-soft">“{column}”</span>
          </span>
        ))}
      </div>
      {ignored.length > 0 && (
        <p className="text-[11px] text-ink-muted mt-2">Ignored: {ignored.join(', ')}</p>
      )}
    </div>
  );
}

function IssueList({ title, icon: Icon, tone, items = [], describe, emptyMessage }) {
  if (!items.length) {
    return (
      <p className="text-[11px] text-ink-muted flex items-center gap-2">
        <Check className="w-3.5 h-3.5 text-success" /> {title}: {emptyMessage}
      </p>
    );
  }
  const shown = items.slice(0, 12);
  return (
    <div>
      <SectionHeader
        icon={Icon}
        title={`${title} (${items.length})`}
        description={tone === 'danger' ? 'These rows are missing something the system needs.' : 'Already saved under the same phone number or email, so they are left alone.'}
      />
      <ul className="space-y-1.5">
        {shown.map((item, i) => (
          <li key={i} className={`text-xs rounded-field border px-3 py-2 flex items-start gap-2.5 ${tone === 'danger' ? 'border-danger/30 bg-danger/10 text-ink-soft' : 'border-warn/30 bg-warn/10 text-ink-soft'}`}>
            <span className="font-mono text-ink-muted shrink-0">row {item.line}</span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold text-ink">{item.name || '(no name)'}</span>
              <span className="block mt-0.5 leading-relaxed">{describe(item)}</span>
            </span>
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <HintText className="mt-2">And {items.length - shown.length} more in this file.</HintText>
      )}
    </div>
  );
}

function errorHint(error) {
  const data = error?.data || {};
  if (data.detectedColumns) return `${error.message} — ${data.hint || ''} Columns found: ${data.detectedColumns.join(', ')}.`;
  return `${error.message}${data.hint ? ` — ${data.hint}` : ''}`;
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'voicepitch-customers-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
