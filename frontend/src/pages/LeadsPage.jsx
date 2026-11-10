import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2, Mail, Phone, StickyNote } from 'lucide-react';
import { api, exportUrls, getStoredKey } from '../services/api.js';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Select, Textarea } from '../components/ui/input.jsx';
import { Table, THead, Th, Td, Tr } from '../components/ui/table.jsx';
import { useToast } from '../components/ui/toast.jsx';

const PIPELINE = ['New', 'Contacted', 'Qualified', 'Won', 'Lost'];
const INTENT_VARIANT = { hot: 'emerald', warm: 'amber', cold: 'rose', unknown: 'slate' };

export default function LeadsPage() {
  const { push: toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [notesFor, setNotesFor] = useState(null); // lead id being edited
  const [notesDraft, setNotesDraft] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['leads'], queryFn: api.leads });
  const leads = data?.leads || [];

  const patch = useMutation({
    mutationFn: ({ id, body }) => api.updateLead(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); toast('Lead updated', 'success'); },
    onError: (e) => toast(`Update failed: ${e.message}`, 'error')
  });

  const del = useMutation({
    mutationFn: api.deleteLead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); toast('Lead deleted', 'success'); },
    onError: (e) => toast(`Delete failed: ${e.message}`, 'error')
  });

  const filtered = leads.filter(l => statusFilter === 'all' || (l.pipelineStatus || 'New') === statusFilter);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-extrabold text-white mr-auto">Leads CRM</h2>
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-auto">
          <option value="all">All stages</option>
          {PIPELINE.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <a href={exportUrls.leadsCsv} download><Button variant="outline" size="sm"><Download className="w-3.5 h-3.5" /> Leads CSV</Button></a>
        <a href={exportUrls.callsCsv} download><Button variant="outline" size="sm"><Download className="w-3.5 h-3.5" /> Calls CSV</Button></a>
      </div>

      <p className="text-[11px] text-slate-500 -mt-1">
        Leads are extracted from call transcripts — use the sparkles button on any call in History, or ask for a re-extract below.
      </p>

      <Card>
        <CardContent className="pt-5">
          {filtered.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm text-slate-500">{isLoading ? 'Loading leads…' : 'No leads yet.'}</p>
              {!isLoading && (
                <p className="text-xs text-slate-600">Finish a call, open History, and click the sparkles icon to capture the prospect automatically.</p>
              )}
            </div>
          ) : (
            <Table>
              <THead><tr>
                <Th>Prospect</Th><Th>Contact</Th><Th>Product</Th><Th>Intent</Th>
                <Th>Stage</Th><Th>Notes</Th><Th className="text-right">Actions</Th>
              </tr></THead>
              <tbody>
                {filtered.map(l => (
                  <Tr key={l.id}>
                    <Td>
                      <div className="font-bold text-white">{l.name}</div>
                      <div className="text-[11px] text-slate-500">{l.company}</div>
                    </Td>
                    <Td className="text-xs space-y-0.5">
                      {l.email && <div className="flex items-center gap-1.5 text-slate-300"><Mail className="w-3 h-3 text-indigo-400" />{l.email}</div>}
                      {l.phone && <div className="flex items-center gap-1.5 text-slate-300"><Phone className="w-3 h-3 text-emerald-400" />{l.phone}</div>}
                      {!l.email && !l.phone && <span className="text-slate-600">No contact captured</span>}
                    </Td>
                    <Td className="text-xs">{l.product}</Td>
                    <Td><Badge variant={INTENT_VARIANT[l.intent] || 'slate'}>{l.intent}</Badge></Td>
                    <Td>
                      <Select
                        className="!px-2 !py-1 !text-xs w-30"
                        value={l.pipelineStatus || 'New'}
                        onChange={e => patch.mutate({ id: l.id, body: { pipelineStatus: e.target.value } })}
                      >
                        {PIPELINE.map(s => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </Td>
                    <Td className="max-w-[220px]">
                      <div className="text-xs text-slate-400 truncate" title={l.notes}>{l.notes || '—'}</div>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" title="Edit notes"
                        onClick={() => { setNotesFor(l.id); setNotesDraft(l.notes || ''); }}>
                        <StickyNote className="w-3.5 h-3.5" />
                      </Button>
                      {l.callId && (
                        <Button variant="ghost" size="sm" title="Re-extract from call"
                          onClick={() => api.extractLead(l.callId)
                            .then(() => { qc.invalidateQueries({ queryKey: ['leads'] }); toast('Lead re-extracted', 'success'); })
                            .catch(e => toast(`Extraction failed: ${e.message}`, 'error'))}>
                          ⟳
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="text-rose-400 hover:text-rose-300" onClick={() => del.mutate(l.id)}>
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

      {/* Notes editor */}
      {notesFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setNotesFor(null)} />
          <Card className="relative w-full max-w-md animate-fadeIn">
            <CardContent className="pt-5 space-y-3">
              <div className="text-sm font-bold text-white">Follow-up notes</div>
              <Textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} className="min-h-[110px]"
                placeholder="Context, commitments, next touchpoint…" />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setNotesFor(null)}>Cancel</Button>
                <Button onClick={() => { patch.mutate({ id: notesFor, body: { notes: notesDraft } }); setNotesFor(null); }}>Save</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
