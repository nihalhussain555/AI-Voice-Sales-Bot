import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users, UserPlus, Download, Search, Trash2, Mail, Phone, MessageSquare,
  PhoneCall, StickyNote, ArrowUpRight
} from 'lucide-react';

import { api, exportUrls } from '../services/api.js';
import { useApp } from '../components/AppShell.jsx';
import {
  INTENT_META, PIPELINE_STAGES, mergeCustomers, relativeTime, formatDuration
} from '../lib/customers.js';
import Page from '../components/shell/Page.jsx';
import { PageHeader, SectionHeader } from '../components/ui/page-header.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge, OutcomeBadge, StatusBadge } from '../components/ui/badge.jsx';
import { Field, HintText, Input, Select, Textarea } from '../components/ui/input.jsx';
import { Table, Td, Th, THead, Tr } from '../components/ui/table.jsx';
import Dialog, { ConfirmDialog } from '../components/ui/dialog.jsx';
import Avatar from '../components/ui/avatar.jsx';
import { EmptyState, LoadState } from '../components/ui/empty-state.jsx';
import { useToast } from '../components/ui/toast.jsx';

const EMPTY_FORM = { name: '', company: '', email: '', phone: '', product: '', notes: '' };

const digits = (v) => String(v || '').replace(/\D/g, '');

// Same contract the bulk import applies, so a hand-typed customer cannot be
// saved in a state the phone line could never dial.
function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'A name is required.';
  const hasPhone = digits(form.phone).length >= 7;
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim());
  if (form.phone.trim() && !hasPhone) errors.phone = 'Needs at least 7 digits, including the country code.';
  if (form.email.trim() && !hasEmail) errors.email = 'That email address looks incomplete.';
  if (!hasPhone && !hasEmail) errors.contact = 'Add a callable phone number or an email address.';
  return errors;
}

export default function CustomersPage() {
  const { push: toast } = useToast();
  const qc = useQueryClient();
  const { products } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('all');
  const [intent, setIntent] = useState('all');
  const [openKey, setOpenKey] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);

  const leadsQuery = useQuery({ queryKey: ['leads'], queryFn: api.leads });
  const callsQuery = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const loading = leadsQuery.isLoading || callsQuery.isLoading;

  const rows = useMemo(
    () => mergeCustomers(leadsQuery.data?.leads || [], callsQuery.data?.calls || []),
    [leadsQuery.data, callsQuery.data]
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['leads'] });
    qc.invalidateQueries({ queryKey: ['calls'] });
  };

  const create = useMutation({
    mutationFn: (body) => api.createLead(body),
    onSuccess: (data) => {
      invalidate();
      setAddOpen(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      toast(`${data.lead?.name || 'Customer'} added to the list`, 'success');
    },
    onError: (e) => toast(`Could not save the customer: ${e.message}`, 'error')
  });

  const patch = useMutation({
    mutationFn: ({ id, body }) => api.updateLead(id, body),
    onSuccess: () => { invalidate(); toast('Customer updated', 'success'); },
    onError: (e) => toast(`Update failed: ${e.message}`, 'error')
  });

  const remove = useMutation({
    mutationFn: (id) => api.deleteLead(id),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
      setOpenKey(null);
      toast('Customer removed', 'success');
    },
    onError: (e) => toast(`Delete failed: ${e.message}`, 'error')
  });

  // Captures a CRM record for a contact that so far only exists in the call log.
  const capture = useMutation({
    mutationFn: (callId) => api.extractLead(callId),
    onSuccess: (r) => { invalidate(); toast(r.message || 'Lead captured from this call', 'success'); },
    onError: (e) => toast(`Capture failed: ${e.message}`, 'error')
  });

  // Deep link from global search and Overview: ?lead=<id> opens that customer.
  useEffect(() => {
    const wanted = searchParams.get('lead');
    if (!wanted || loading) return;
    const match = rows.find(r => r.lead?.id === wanted || r.key === wanted);
    if (match) {
      setOpenKey(match.key);
      searchParams.delete('lead');
      setSearchParams(searchParams, { replace: true });
    }
  }, [rows, loading, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(r => {
      if (stage !== 'all' && r.stage !== stage) return false;
      if (intent !== 'all' && r.intent !== intent) return false;
      if (!needle) return true;
      return [r.name, r.company, r.email, r.phone, ...r.products]
        .some(v => String(v || '').toLowerCase().includes(needle));
    });
  }, [rows, query, stage, intent]);

  const selected = rows.find(r => r.key === openKey) || null;
  const reachable = rows.filter(r => digits(r.phone).length >= 7 || r.email).length;

  const set = (k) => (e) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setFormErrors(prev => ({ ...prev, [k]: undefined, contact: undefined }));
  };

  return (
    <Page>
      <PageHeader
        description="Everyone the agent has spoken to, plus contacts you add or import. Stages and notes live here; the conversations themselves stay in Call History."
        meta={
          <>
            <Badge variant="primary" dot>{rows.length} {rows.length === 1 ? 'customer' : 'customers'}</Badge>
            <Badge variant="success" dot>{reachable} reachable</Badge>
          </>
        }
        actions={
          <>
            <a href={exportUrls.leadsCsv} download>
              <Button variant="outline" size="sm"><Download className="w-3.5 h-3.5" /> Export CSV</Button>
            </a>
            <Button size="sm" onClick={() => setAddOpen(true)}><UserPlus className="w-3.5 h-3.5" /> Add customer</Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="py-3.5 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[13rem]">
            <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, company, email or number"
              aria-label="Search customers"
              className="pl-9"
            />
          </div>
          <Select value={stage} onChange={e => setStage(e.target.value)} aria-label="Filter by stage" className="w-auto">
            <option value="all">Any stage</option>
            {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={intent} onChange={e => setIntent(e.target.value)} aria-label="Filter by intent" className="w-auto">
            <option value="all">Any intent</option>
            {Object.entries(INTENT_META).map(([value, m]) => <option key={value} value={value}>{m.label}</option>)}
          </Select>
          {(query || stage !== 'all' || intent !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setQuery(''); setStage('all'); setIntent('all'); }}
            >
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      <LoadState
        isLoading={loading}
        error={leadsQuery.error || callsQuery.error}
        onRetry={() => { leadsQuery.refetch(); callsQuery.refetch(); }}
        isEmpty={!rows.length}
        emptyIcon={Users}
        emptyTitle="No customers yet"
        emptyMessage="Finish a browser demo call or a real dial and the prospect lands here automatically. You can also add someone by hand or import a CSV."
        emptyAction={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" onClick={() => setAddOpen(true)}><UserPlus className="w-3.5 h-3.5" /> Add customer</Button>
            <Link to="/import"><Button variant="outline" size="sm">Import a CSV</Button></Link>
            <Link to="/agent"><Button variant="ghost" size="sm">Run a demo call</Button></Link>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No customer matches these filters"
            message="Widen the search text, or clear the stage and intent filters."
            action={<Button variant="outline" size="sm" onClick={() => { setQuery(''); setStage('all'); setIntent('all'); }}>Clear filters</Button>}
          />
        ) : (
          <Table>
            <THead><tr>
              <Th>Customer</Th>
              <Th>Contact</Th>
              <Th>Intent</Th>
              <Th>Stage</Th>
              <Th>Last contacted</Th>
              <Th align="right">Actions</Th>
            </tr></THead>
            <tbody>
              {filtered.map(r => (
                <Tr key={r.key}>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setOpenKey(r.key)}
                      className="flex items-center gap-3 text-left group min-w-0"
                    >
                      <Avatar name={r.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink truncate group-hover:text-primary transition-colors">
                          {r.name}
                        </span>
                        <span className="block text-[11px] text-ink-muted truncate">
                          {r.company || (r.products.length ? r.products[0] : 'No company recorded')}
                        </span>
                      </span>
                    </button>
                  </Td>
                  <Td className="text-xs space-y-1 max-w-[15rem]">
                    {r.phone && (
                      <span className="flex items-center gap-1.5 text-ink-soft">
                        <Phone className="w-3 h-3 text-success shrink-0" aria-hidden="true" />
                        <span className="truncate font-mono">{r.phone}</span>
                      </span>
                    )}
                    {r.email && (
                      <span className="flex items-center gap-1.5 text-ink-soft">
                        <Mail className="w-3 h-3 text-primary shrink-0" aria-hidden="true" />
                        <span className="truncate">{r.email}</span>
                      </span>
                    )}
                    {!r.phone && !r.email && <span className="text-ink-muted">No contact details</span>}
                  </Td>
                  <Td><Badge variant={INTENT_META[r.intent]?.tone || 'slate'}>{INTENT_META[r.intent]?.label || 'Unranked'}</Badge></Td>
                  <Td>
                    {r.lead ? (
                      <Select
                        value={r.stage}
                        aria-label={`Stage for ${r.name}`}
                        className="!px-2 !py-1 !text-xs w-[8.5rem]"
                        onChange={e => patch.mutate({ id: r.lead.id, body: { pipelineStatus: e.target.value } })}
                        disabled={patch.isPending}
                      >
                        {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    ) : (
                      <Badge variant="slate">Not captured</Badge>
                    )}
                  </Td>
                  <Td className="text-xs whitespace-nowrap">
                    {r.lastAt ? (
                      <>
                        <div className="text-ink-soft">{relativeTime(new Date(r.lastAt).toISOString())}</div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <StatusBadge status={r.lastStatus} />
                          <span className="text-ink-muted">{r.callCount} {r.callCount === 1 ? 'call' : 'calls'}</span>
                        </div>
                      </>
                    ) : <span className="text-ink-muted">Never called</span>}
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setOpenKey(r.key)}>Details</Button>
                    {r.lead && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-danger hover:text-danger"
                        aria-label={`Remove ${r.name}`}
                        onClick={() => setConfirmDelete(r)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </LoadState>

      {selected && (
        <CustomerDialog
          row={selected}
          onClose={() => setOpenKey(null)}
          onPatch={patch.mutate}
          patching={patch.isPending}
          onCapture={(callId) => capture.mutate(callId)}
          capturing={capture.isPending}
          onRemove={() => setConfirmDelete(selected)}
        />
      )}

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        wide
        title="Add a customer"
        description="Saved to the customer list straight away. Nothing is dialled until you start a call from the Voice Agent page."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={create.isPending}
              disabled={!form.name.trim()}
              onClick={() => {
                const errors = validate(form);
                setFormErrors(errors);
                if (Object.keys(errors).length) return;
                create.mutate({ ...form, pipelineStatus: 'New', intent: 'unknown' });
              }}
            >
              Save customer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Name *" error={formErrors.name} htmlFor="c-name">
              <Input id="c-name" value={form.name} onChange={set('name')} placeholder="Priya Nair" invalid={!!formErrors.name} />
            </Field>
            <Field label="Company" htmlFor="c-company">
              <Input id="c-company" value={form.company} onChange={set('company')} placeholder="Northwind Logistics" />
            </Field>
            <Field label="Phone" error={formErrors.phone} htmlFor="c-phone" hint="Include the country code, e.g. +91 98765 43210">
              <Input id="c-phone" value={form.phone} onChange={set('phone')} placeholder="+919876543210" invalid={!!formErrors.phone} />
            </Field>
            <Field label="Email" error={formErrors.email} htmlFor="c-email">
              <Input id="c-email" type="email" value={form.email} onChange={set('email')} placeholder="priya@northwind.example" invalid={!!formErrors.email} />
            </Field>
          </div>
          {formErrors.contact && <p className="text-[11px] text-danger -mt-2">{formErrors.contact}</p>}
          <Field label="Product of interest" htmlFor="c-product">
            <Select id="c-product" value={form.product} onChange={set('product')}>
              <option value="">Not decided yet</option>
              {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Notes" htmlFor="c-notes">
            <Textarea id="c-notes" value={form.notes} onChange={set('notes')} placeholder="Where they came from, what they asked for, who else is involved…" />
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete?.lead && remove.mutate(confirmDelete.lead.id)}
        busy={remove.isPending}
        title={`Remove ${confirmDelete?.name || 'customer'}?`}
        confirmLabel="Remove customer"
        message="The customer is deleted from the CRM list. Their calls stay in Call History and continue to count in Analytics."
      />
    </Page>
  );
}

function CustomerDialog({ row, onClose, onPatch, patching, onCapture, capturing, onRemove }) {
  const [notes, setNotes] = useState(row.lead?.notes || '');
  const dirty = row.lead && notes !== (row.lead.notes || '');

  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title={row.name}
      description={row.company || (row.products.length ? row.products.join(' · ') : 'No company recorded')}
      footer={
        <>
          {row.lead && (
            <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={onRemove}>
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          {row.lead && (
            <Button size="sm" disabled={!dirty} loading={patching} onClick={() => onPatch({ id: row.lead.id, body: { notes } })}>
              Save notes
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3.5">
          <Avatar name={row.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={INTENT_META[row.intent]?.tone || 'slate'}>{INTENT_META[row.intent]?.label || 'Unranked'}</Badge>
              {row.lead
                ? <Badge variant={row.stage === 'Won' ? 'success' : row.stage === 'Lost' ? 'danger' : 'primary'}>{row.stage}</Badge>
                : <Badge variant="slate">Not in CRM yet</Badge>}
              {row.lastAt && <StatusBadge status={row.lastStatus} />}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" />{row.callCount} {row.callCount === 1 ? 'call' : 'calls'}</span>
              <span className="inline-flex items-center gap-1.5"><PhoneCall className="w-3.5 h-3.5" />
                {formatDuration(row.history.reduce((sum, c) => sum + (c.duration || 0), 0))} talked</span>
              {row.lastAt && <span>Last seen {relativeTime(new Date(row.lastAt).toISOString())}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ContactRow icon={Phone} label="Phone" value={row.phone} href={row.phone ? `tel:${row.phone}` : null} />
          <ContactRow icon={Mail} label="Email" value={row.email} href={row.email ? `mailto:${row.email}` : null} />
        </div>

        {row.lead ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Pipeline stage">
              <Select
                value={row.stage}
                disabled={patching}
                onChange={e => onPatch({ id: row.lead.id, body: { pipelineStatus: e.target.value } })}
              >
                {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Intent">
              <Select
                value={row.intent}
                disabled={patching}
                onChange={e => onPatch({ id: row.lead.id, body: { intent: e.target.value } })}
              >
                {Object.entries(INTENT_META).map(([value, m]) => <option key={value} value={value}>{m.label}</option>)}
              </Select>
            </Field>
          </div>
        ) : (
          <div className="rounded-field border border-line bg-surface-3/60 p-3.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-muted leading-relaxed max-w-sm">
              This contact only exists in the call log. Capturing them reads the last conversation and builds a CRM record from what was actually said.
            </p>
            {row.history[0] && (
              <Button size="sm" loading={capturing} onClick={() => onCapture(row.history[0].id)}>
                <StickyNote className="w-3.5 h-3.5" /> Capture from last call
              </Button>
            )}
          </div>
        )}

        {!!row.lead?.objections?.length && (
          <div>
            <SectionHeader title="Objections raised" />
            <ul className="space-y-1.5">
              {row.lead.objections.map((o, i) => (
                <li key={i} className="text-xs text-ink-soft bg-warn/10 border border-warn/25 rounded-field px-3 py-2">{o}</li>
              ))}
            </ul>
          </div>
        )}

        <Field label="Follow-up notes">
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={!row.lead}
            placeholder={row.lead ? 'Context, commitments, next touchpoint…' : 'Capture this contact to write notes.'}
            className="min-h-[92px]"
          />
        </Field>

        <div>
          <SectionHeader
            title="Call history"
            description={row.history.length ? 'Every conversation recorded for this contact.' : 'No calls yet.'}
          />
          {row.history.length > 0 && (
            <Table containerClassName="rounded-field">
              <THead><tr>
                <Th>Date</Th><Th>Product</Th><Th>Result</Th><Th align="right">Duration</Th><Th align="right">Score</Th><Th />
              </tr></THead>
              <tbody>
                {row.history.map(c => (
                  <Tr key={c.id}>
                    <Td className="text-xs whitespace-nowrap">
                      {new Date(c.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Td>
                    <Td className="text-xs">{c.product || '—'}</Td>
                    <Td>
                      {c.channel === 'phone'
                        ? <OutcomeBadge outcome={c.outcome} label={c.outcomeLabel} />
                        : <StatusBadge status={c.status} />}
                    </Td>
                    <Td align="right" className="text-xs font-mono">{formatDuration(c.duration || 0)}</Td>
                    <Td align="right" className="text-xs font-mono">{c.summary?.dealScore ?? '—'}</Td>
                    <Td align="right">
                      <Link to={`/history?call=${c.id}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-hover">
                        Transcript <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <HintText>Transcripts, recordings and summaries are stored with the call, not duplicated here.</HintText>
      </div>
    </Dialog>
  );
}

function ContactRow({ icon: Icon, label, value, href }) {
  return (
    <div className="rounded-field border border-line bg-surface-3/50 px-3.5 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      {value ? (
        href
          ? <a href={href} className="block text-sm text-ink font-mono mt-1 truncate hover:text-primary transition-colors">{value}</a>
          : <div className="text-sm text-ink font-mono mt-1 truncate">{value}</div>
      ) : <div className="text-sm text-ink-muted mt-1">Not recorded</div>}
    </div>
  );
}
