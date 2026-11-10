import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Trash2, Download, Sparkles, ChevronDown } from 'lucide-react';
import { api, exportUrls, resolveAsset } from '../services/api.js';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge, StatusBadge, OutcomeBadge } from '../components/ui/badge.jsx';
import { Select } from '../components/ui/input.jsx';
import { Table, THead, Th, Td, Tr } from '../components/ui/table.jsx';
import Dialog from '../components/ui/dialog.jsx';
import { useToast } from '../components/ui/toast.jsx';
import { PostCallSummary } from './CallPage.jsx';

const fmtDur = (s) => `${Math.floor(s / 60)}m ${s % 60}s`;
const fmtDate = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function HistoryPage() {
  const { push: toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [detailCall, setDetailCall] = useState(null);

  const { data, isLoading, refetch } = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const calls = data?.calls || [];

  const del = useMutation({
    mutationFn: api.deleteCall,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calls'] }); toast('Call deleted', 'success'); },
    onError: (e) => toast(`Delete failed: ${e.message}`, 'error')
  });

  const extract = useMutation({
    mutationFn: api.extractLead,
    onSuccess: (r) => toast(r.message || 'Lead captured from this call', 'success'),
    onError: (e) => toast(`Lead extraction failed: ${e.message}`, 'error')
  });

  const products = useMemo(() => [...new Set(calls.map(c => c.product))], [calls]);
  const filtered = calls.filter(c =>
    (statusFilter === 'all' || c.status === statusFilter) &&
    (productFilter === 'all' || c.product === productFilter)
  );

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-extrabold text-white mr-auto">Call History</h2>
        <Select value={productFilter} onChange={e => setProductFilter(e.target.value)} className="w-auto">
          <option value="all">All products</option>
          {products.map(p => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-auto">
          <option value="all">All statuses</option>
          {['Converted', 'Demo Requested', 'Interested', 'Follow-up Required', 'Not Interested', 'No Response'].map(s =>
            <option key={s} value={s}>{s}</option>)}
        </Select>
        <a href={exportUrls.callsCsv} download>
          <Button variant="outline" size="sm"><Download className="w-3.5 h-3.5" /> CSV</Button>
        </a>
        <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw className={cnspin(isLoading)} /></Button>
      </div>

      <Card>
        <CardContent className="pt-5">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500 py-10 text-center">
              {isLoading ? 'Loading calls…' : 'No calls match these filters yet.'}
            </p>
          ) : (
            <Table>
              <THead><tr>
                <Th>Date</Th><Th>Customer</Th><Th>Product</Th><Th>Channel</Th>
                <Th>Status</Th><Th>Outcome</Th><Th>Duration</Th><Th>Score</Th><Th className="text-right">Actions</Th>
              </tr></THead>
              <tbody>
                {filtered.map(c => (
                  <Tr key={c.id}>
                    <Td className="whitespace-nowrap">{fmtDate(c.timestamp)}</Td>
                    <Td>
                      <div className="font-semibold text-white">{c.customerName}</div>
                      <div className="text-[11px] text-slate-500">{c.company}</div>
                    </Td>
                    <Td>{c.product}</Td>
                    <Td>
                      <Badge variant="slate">{c.channel || 'browser'}</Badge>
                      {c.channel === 'phone' && c.direction && (
                        <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{c.direction}</div>
                      )}
                    </Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td>{c.channel === 'phone' ? <OutcomeBadge outcome={c.outcome} label={c.outcomeLabel} /> : <span className="text-slate-600">—</span>}</Td>
                    <Td>{fmtDur(c.duration || 0)}</Td>
                    <Td className="font-mono">{c.summary?.dealScore ?? '—'}</Td>
                    <Td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setDetailCall(c)}>
                        <ChevronDown className="w-3.5 h-3.5" /> Detail
                      </Button>
                      <Button variant="ghost" size="sm" title="Extract lead from transcript"
                        onClick={() => extract.mutate(c.id)} disabled={extract.isPending}>
                        <Sparkles className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                        onClick={() => del.mutate(c.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail = same rich summary view as post-call, plus full transcript */}
      <Dialog open={!!detailCall} onClose={() => setDetailCall(null)} wide title={`Call · ${fmtDate(detailCall?.timestamp || '')}`}>
        {detailCall && (
          <div className="space-y-4">
            <PostCallSummaryBody call={detailCall} />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Full transcript</div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
                {(detailCall.transcript || []).map((m, i) => (
                  <div key={i} className={cnRow(m.sender)}>
                    <span className="text-[10px] font-bold uppercase opacity-60 shrink-0 w-14">{m.sender}</span>
                    <span className="flex-1">{m.text}</span>
                    <span className="text-[10px] font-mono opacity-40 shrink-0">{m.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function cnRow(sender) {
  return sender === 'bot'
    ? 'flex gap-3 text-xs text-slate-300 bg-slate-800/50 rounded-lg px-3 py-2'
    : 'flex gap-3 text-xs text-emerald-100 bg-emerald-900/30 rounded-lg px-3 py-2';
}
function cnspin(b) { return b ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'; }

// Shared summary renderer (also used by the post-call modal on CallPage)
export function PostCallSummaryBody({ call }) {
  const s = call.summary || {};
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={s.status} />
        <Badge variant="slate">{call.product}</Badge>
        <Badge variant="slate">{call.language}</Badge>
        {typeof s.dealScore === 'number' && <Badge variant={s.dealScore >= 80 ? 'emerald' : 'amber'}>Deal score {s.dealScore}%</Badge>}
      </div>
      {s.overview && <p className="text-sm text-slate-300 leading-relaxed">{s.overview}</p>}
      {call.recordingUrl && <audio controls src={resolveAsset(call.recordingUrl)} className="w-full" />}
    </div>
  );
}
