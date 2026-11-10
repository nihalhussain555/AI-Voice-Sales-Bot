import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import { PhoneCall, TrendingUp, Clock, Target, Users2 } from 'lucide-react';
import { api } from '../services/api.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card.jsx';
import { Badge, StatusBadge } from '../components/ui/badge.jsx';
import { cn } from '../lib/cn.js';

const RANGES = [7, 30, 90];
const STATUS_COLORS = {
  'Converted': '#10b981',
  'Demo Requested': '#0ea5e9',
  'Interested': '#6366f1',
  'Follow-up Required': '#f59e0b',
  'Not Interested': '#f43f5e',
  'No Response': '#64748b'
};

const tooltipStyle = {
  contentStyle: { background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 },
  labelStyle: { color: '#e2e8f0' },
  itemStyle: { color: '#cbd5e1' }
};

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => api.analytics(days)
  });

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-extrabold text-white mr-auto">Analytics</h2>
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
          {RANGES.map(r => (
            <button key={r} onClick={() => setDays(r)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition',
                days === r ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white')}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      {error && <Card><CardContent className="py-6 text-sm text-rose-300">Failed to load analytics: {error.message}</CardContent></Card>}
      {isLoading && !data && <Card><CardContent className="py-10 text-center text-sm text-slate-500">Loading…</CardContent></Card>}

      {data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={PhoneCall} label="Total calls" value={data.totals.totalCalls} tint="indigo" />
            <Kpi icon={TrendingUp} label="Conversion rate" value={`${data.totals.conversionRate}%`} tint="emerald" />
            <Kpi icon={Clock} label="Avg duration" value={fmtDur(data.totals.avgDuration)} tint="sky" />
            <Kpi icon={Target} label="Avg deal score" value={data.totals.avgDealScore} tint="amber" />
            <Kpi icon={Users2} label="Engagement" value={`${data.totals.engagementRate}%`} tint="purple" />
          </div>

          {/* Funnel + status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Conversion funnel</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                {data.funnel.map((f, i) => {
                  const max = data.funnel[0].count || 1;
                  const pct = Math.round((f.count / max) * 100);
                  return (
                    <div key={f.stage}>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="font-bold text-slate-300">{f.stage}</span>
                        <span className="text-slate-500 font-mono">{f.count} · {pct}%</span>
                      </div>
                      <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all"
                          style={{ width: `${Math.max(pct, i === 0 ? 100 : 2)}%`, opacity: 1 - i * 0.13 }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Status distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data.statusDistribution.filter(d => d.count > 0)} dataKey="count" nameKey="status"
                      innerRadius={52} outerRadius={82} paddingAngle={3} stroke="none" label={false}>
                      {data.statusDistribution.filter(d => d.count > 0).map(entry => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#64748b'} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Daily trend */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Calls & conversions over time</CardTitle>
                <CardDescription>Daily totals in the selected window</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.daily}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="calls" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="avgDealScore" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BreakdownCard title="By product" rows={data.byProduct} />
            <BreakdownCard title="By language" rows={data.byLanguage} />
            <BreakdownCard title="By channel" rows={data.byChannel} />
          </div>

          {/* Lead pipeline + recent statuses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Lead pipeline</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.leadPipeline}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="status" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Top performers</CardTitle><CardDescription>Highest-scoring calls in window</CardDescription></CardHeader>
              <CardContent>
                {(!data.topCalls || data.topCalls.length === 0) ? (
                  <p className="text-xs text-slate-500 py-4">No scored calls yet.</p>
                ) : (
                  <div className="space-y-2">
                    {data.topCalls.map(c => (
                      <div key={c.id} className="flex items-center gap-3 text-xs bg-slate-950/50 rounded-xl px-3 py-2 border border-slate-800/60">
                        <span className="font-bold text-white truncate flex-1">{c.customerName}</span>
                        <StatusBadge status={c.status} />
                        <span className="font-mono text-amber-400">{c.dealScore}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tint }) {
  const tints = {
    indigo: 'text-indigo-400 bg-indigo-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
    sky: 'text-sky-400 bg-sky-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    purple: 'text-purple-400 bg-purple-500/10'
  };
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-3', tints[tint])}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="text-2xl font-extrabold text-white leading-none">{value}</div>
        <div className="text-[11px] text-slate-500 font-semibold mt-1.5">{label}</div>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ title, rows }) {
  const max = Math.max(1, ...(rows || []).map(r => r.calls));
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2.5">
        {(!rows || rows.length === 0) && <p className="text-xs text-slate-500">No data in window.</p>}
        {(rows || []).slice(0, 5).map(r => (
          <div key={r.name}>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="font-semibold text-slate-300 truncate">{r.name}</span>
              <span className="text-slate-500 font-mono shrink-0 ml-2">{r.calls} calls · {r.conversions} won · {fmtDur(r.avgDuration)}</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(r.calls / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function fmtDur(s) {
  if (!s) return '0s';
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ''}` : `${s}s`;
}
