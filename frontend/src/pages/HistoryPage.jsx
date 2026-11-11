import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Download, RefreshCw, Search, Trash2, FileJson, Smartphone } from 'lucide-react';

import { api, exportUrls } from '../services/api.js';
import { formatDuration, relativeTime } from '../lib/customers.js';
import Page from '../components/shell/Page.jsx';
import { PageHeader, SectionHeader } from '../components/ui/page-header.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge, OutcomeBadge, StatusBadge } from '../components/ui/badge.jsx';
import { Input, Select } from '../components/ui/input.jsx';
import { Table, Td, Th, THead, Tr } from '../components/ui/table.jsx';
import Dialog, { ConfirmDialog } from '../components/ui/dialog.jsx';
import Tabs from '../components/ui/tabs.jsx';
import Avatar from '../components/ui/avatar.jsx';
import Transcript from '../components/Transcript.jsx';
import { CallSummaryBody } from '../components/agent/CallSummaryDialog.jsx';
import { EmptyState, LoadState } from '../components/ui/empty-state.jsx';
import { useToast } from '../components/ui/toast.jsx';

const STATUSES = ['Converted', 'Demo Requested', 'Interested', 'Follow-up Required', 'Not Interested', 'No Response'];
const CHANNELS = [
  { value: 'all', label: 'All' },
  { value: 'browser', label: 'Browser' },
  { value: 'phone', label: 'Phone', icon: Smartphone }
];

const fmtDateTime = (iso) => new Date(iso).toLocaleString([], {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

export default function HistoryPage() {
  const { push: toast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [product, setProduct] = useState('all');
  const [channel, setChannel] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const calls = data?.calls || [];

  const del = useMutation({
    mutationFn: api.deleteCall,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calls'] });
      setConfirmId(null);
      setOpenId(null);
      toast('Call deleted from history', 'success');
    },
    onError: (e) => toast(`Delete failed: ${e.message}`, 'error')
  });

  const extract = useMutation({
    mutationFn: api.extractLead,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast(r.message || 'Lead captured from this call', 'success');
    },
    onError: (e) => toast(`Lead extraction failed: ${e.message}`, 'error')
  });

  const products = useMemo(() => [...new Set(calls.map(c => c.product).filter(Boolean))].sort(), [calls]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return calls.filter(c => {
      if (status !== 'all' && c.status !== status) return false;
      if (product !== 'all' && c.product !== product) return false;
      if (channel !== 'all' && (c.channel || 'browser') !== channel) return false;
      if (!needle) return true;
      return [c.customerName, c.company, c.product, c.to, c.from]
        .some(v => String(v || '').toLowerCase().includes(needle));
    });
  }, [calls, query, status, product, channel]);

  const totals = useMemo(() => ({
    talk: filtered.reduce((sum, c) => sum + (c.duration || 0), 0),
    turns: filtered.reduce((sum, c) => sum + (c.transcript || []).length, 0)
  }), [filtered]);

  const selected = calls.find(c => c.id === openId) || null;

  // Deep link from Overview, Analytics and the customer detail view.
  useEffect(() => {
    const wanted = searchParams.get('call');
    if (!wanted || isLoading) return;
    if (calls.some(c => c.id === wanted)) {
      setOpenId(wanted);
      searchParams.delete('call');
      setSearchParams(searchParams, { replace: true });
    }
  }, [calls, isLoading, searchParams, setSearchParams]);

  const clearFilters = () => { setQuery(''); setStatus('all'); setProduct('all'); setChannel('all'); };
  const filtersActive = query || status !== 'all' || product !== 'all' || channel !== 'all';

  return (
    <Page>
      <PageHeader
        description="Every conversation the agent has had, with its summary, transcript and recording. Records are written when a call ends — nothing here is simulated."
        meta={calls.length > 0 && (
          <>
            <Badge variant="slate">{filtered.length} of {calls.length} calls</Badge>
            <Badge variant="primary">{formatDuration(totals.talk)} talked</Badge>
            <Badge variant="violet">{totals.turns} turns</Badge>
          </>
        )}
        actions={
          <>
            <a href={exportUrls.callsCsv} download>
              <Button variant="outline" size="sm"><Download className="w-3.5 h-3.5" /> CSV</Button>
            </a>
            <a href={exportUrls.callsJson} download>
              <Button variant="outline" size="sm"><FileJson className="w-3.5 h-3.5" /> JSON</Button>
            </a>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="py-3.5 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[13rem]">
              <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search customer, company or number"
                aria-label="Search calls"
                className="pl-9"
              />
            </div>
            <Select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status" className="w-auto">
              <option value="all">Any outcome status</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select value={product} onChange={e => setProduct(e.target.value)} aria-label="Filter by product" className="w-auto">
              <option value="all">All products</option>
              {products.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
            {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
          </div>
          <Tabs items={CHANNELS} value={channel} onChange={setChannel} size="xs" ariaLabel="Filter by channel" />
        </CardContent>
      </Card>

      <LoadState
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        isEmpty={!calls.length}
        emptyIcon={History}
        emptyTitle="No calls archived yet"
        emptyMessage="Run a browser demo or dial a number from the Voice Agent page. The transcript, summary and recording land here as soon as the call ends."
        emptyAction={<Link to="/agent"><Button size="sm">Start a call</Button></Link>}
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No call matches these filters"
            message="Try a different search, or clear the filters to see all archived calls."
            action={<Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <Table>
            <THead><tr>
              <Th>When</Th><Th>Customer</Th><Th>Product</Th><Th>Channel</Th>
              <Th>Status</Th><Th>Call result</Th><Th align="right">Duration</Th><Th align="right">Score</Th><Th align="right">Actions</Th>
            </tr></THead>
            <tbody>
              {filtered.map(c => (
                <Tr key={c.id}>
                  <Td className="whitespace-nowrap">
                    <div className="text-xs font-semibold text-ink">{fmtDateTime(c.timestamp)}</div>
                    <div className="text-[11px] text-ink-muted mt-0.5">{relativeTime(c.timestamp)}</div>
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setOpenId(c.id)}
                      className="flex items-center gap-2.5 text-left group min-w-0"
                    >
                      <Avatar name={c.customerName} size="xs" />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-ink truncate group-hover:text-primary transition-colors">{c.customerName}</span>
                        <span className="block text-[11px] text-ink-muted truncate">{c.company}</span>
                      </span>
                    </button>
                  </Td>
                  <Td className="text-xs">{c.product}</Td>
                  <Td>
                    <Badge variant="slate">{c.channel || 'browser'}</Badge>
                    {c.channel === 'phone' && c.direction && (
                      <div className="text-[10px] uppercase tracking-wider text-ink-muted mt-1">{c.direction}</div>
                    )}
                  </Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td>
                    {c.channel === 'phone'
                      ? <OutcomeBadge outcome={c.outcome} label={c.outcomeLabel} />
                      : <span className="text-ink-muted">—</span>}
                  </Td>
                  <Td align="right" className="text-xs font-mono">{formatDuration(c.duration || 0)}</Td>
                  <Td align="right" className="text-xs font-mono">{c.summary?.dealScore ?? '—'}</Td>
                  <Td align="right" className="whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(c.id)}>Open</Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete call from ${c.customerName}`}
                      className="text-danger hover:text-danger"
                      onClick={() => setConfirmId(c.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </LoadState>

      {selected && (
        <Dialog
          open
          onClose={() => setOpenId(null)}
          size="xl"
          title={`${selected.customerName} · ${selected.product || 'call'}`}
          description={`${fmtDateTime(selected.timestamp)} · ${selected.language || 'English'} · ${selected.channel || 'browser'} channel`}
          footer={
            <>
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto"
                loading={extract.isPending}
                onClick={() => extract.mutate(selected.id)}
              >
                Capture as customer
              </Button>
              <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirmId(selected.id)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
              <Button variant="outline" size="sm" onClick={() => setOpenId(null)}>Close</Button>
            </>
          }
        >
          <div className="space-y-5">
            <CallSummaryBody call={selected} />

            <div>
              <SectionHeader
                title="Full transcript"
                description={selected.transcript?.length
                  ? `${selected.transcript.length} turns, exactly as captured during the call.`
                  : 'No speech was transcribed on this call.'}
              />
              <div className="rounded-card border border-line bg-surface-3/40 p-4 max-h-80 overflow-y-auto">
                <Transcript
                  turns={selected.transcript || []}
                  scrollable={false}
                  empty={{ title: 'No conversation recorded on this call' }}
                />
              </div>
            </div>
          </div>
        </Dialog>
      )}

      <ConfirmDialog
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => del.mutate(confirmId)}
        busy={del.isPending}
        title="Delete this call?"
        confirmLabel="Delete call"
        message="The transcript, summary and recording for this call are removed permanently. Analytics totals drop accordingly."
      />
    </Page>
  );
}
