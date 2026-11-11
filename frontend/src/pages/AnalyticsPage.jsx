import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import { Target, Funnel, PieChart as PieIcon, TrendingUp, Layers, Trophy, Users2 } from 'lucide-react';

import { api } from '../services/api.js';
import { useThemeTokens } from '../context/theme.jsx';
import { formatDuration } from '../lib/customers.js';
import Page from '../components/shell/Page.jsx';
import { PageHeader, SectionHeader } from '../components/ui/page-header.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Badge, StatusBadge } from '../components/ui/badge.jsx';
import Tabs from '../components/ui/tabs.jsx';
import { MeterRow } from '../components/ui/progress.jsx';
import Avatar from '../components/ui/avatar.jsx';
import ChartTooltip from '../components/charts/ChartTooltip.jsx';
import { LoadState } from '../components/ui/empty-state.jsx';

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' }
];

const STATUS_TOKENS = {
  'Converted': 'success',
  'Demo Requested': 'info',
  'Interested': 'primary',
  'Follow-up Required': 'warn',
  'Not Interested': 'danger',
  'No Response': 'inkMuted'
};

const shortDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });

export default function AnalyticsPage() {
  const tokens = useThemeTokens();
  const [days, setDays] = useState(30);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => api.analytics(days)
  });

  const axis = { fontSize: 10, fill: tokens.inkMuted };
  const statusSlices = (data?.statusDistribution || []).filter(d => d.count > 0);

  return (
    <Page>
      <PageHeader
        description="How the agent performs across every archived conversation: where calls stall, which product converts, and which outcomes the phone line actually produces."
        meta={data && (
          <>
            <Badge variant="slate">{data.totals.totalCalls} calls in window</Badge>
            <Badge variant="success">{data.totals.converted} converted</Badge>
            <Badge variant="primary">{formatDuration(data.totals.avgDuration)} average</Badge>
          </>
        )}
        actions={<Tabs items={RANGES} value={days} onChange={setDays} size="sm" ariaLabel="Analytics range" />}
      />

      <LoadState isLoading={isLoading} error={error} onRetry={refetch} skeleton="card">
        {data && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <SectionHeader
                  icon={Funnel}
                  title="Conversion funnel"
                  description="Each stage counts calls that reached it in the window."
                  className="px-5 pt-5"
                />
                <CardContent className="pt-0 space-y-3">
                  {data.funnel.map((f, i) => (
                    <MeterRow
                      key={f.stage}
                      name={f.stage}
                      value={f.count}
                      max={data.funnel[0].count || 1}
                      detail={`${f.count} · ${Math.round((f.count / (data.funnel[0].count || 1)) * 100)}%`}
                      tone={i === data.funnel.length - 1 ? 'success' : 'primary'}
                    />
                  ))}
                </CardContent>
              </Card>

              <Card>
                <SectionHeader
                  icon={PieIcon}
                  title="Status distribution"
                  description="The summary the agent wrote after each conversation."
                  className="px-5 pt-5"
                />
                <CardContent className="pt-0">
                  {statusSlices.length === 0 ? (
                    <p className="text-xs text-ink-muted py-8 text-center">No summarised calls in this window.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={statusSlices} dataKey="count" nameKey="status"
                          innerRadius={52} outerRadius={82} paddingAngle={3} stroke="none">
                          {statusSlices.map(entry => (
                            <Cell key={entry.status} fill={tokens[STATUS_TOKENS[entry.status] || 'inkMuted']} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11, color: tokens.inkSoft }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <SectionHeader
                icon={TrendingUp}
                title="Calls, conversions and deal score"
                description="Daily totals for the selected window. The dashed line is the average deal score."
                className="px-5 pt-5"
              />
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={data.daily}>
                    <CartesianGrid stroke={tokens.line} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={axis} tickFormatter={shortDay} tickLine={false} axisLine={{ stroke: tokens.line }} />
                    <YAxis tick={axis} allowDecimals={false} width={30} tickLine={false} axisLine={false} />
                    {/* Deal score is a 0-100 average, so it gets its own right-hand scale. */}
                    <YAxis yAxisId="score" orientation="right" domain={[0, 100]} tick={axis} width={30} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip format={(key, value) => (key === 'avgDealScore' ? `${value}/100` : value)} />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: tokens.inkSoft }} />
                    <Line type="monotone" dataKey="calls" name="Calls" stroke={tokens.primary} strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="conversions" name="Conversions" stroke={tokens.success} strokeWidth={2.5} dot={false} />
                    <Line yAxisId="score" type="monotone" dataKey="avgDealScore" name="Deal score" stroke={tokens.warn} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <BreakdownCard title="By product" icon={Layers} rows={data.byProduct} />
              <BreakdownCard title="By language" icon={Layers} rows={data.byLanguage} />
              <BreakdownCard title="By channel" icon={Layers} rows={data.byChannel} />
              <BreakdownCard
                title="By call outcome"
                icon={Target}
                description="Phone attempts that connected, and why the rest did not."
                rows={data.byOutcome}
              />
              <BreakdownCard title="By direction" icon={Users2} description="Inbound calls are counted per caller number." rows={data.byDirection} />

              <Card>
                <SectionHeader
                  icon={Users2}
                  title="Lead pipeline"
                  description="Where captured customers sit today."
                  className="px-5 pt-5"
                />
                <CardContent className="pt-0">
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={data.leadPipeline}>
                      <CartesianGrid stroke={tokens.line} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="status" tick={axis} tickLine={false} axisLine={{ stroke: tokens.line }} />
                      <YAxis tick={axis} allowDecimals={false} width={26} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: tokens.surface3 }} />
                      <Bar dataKey="count" name="Customers" fill={tokens.violet} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <SectionHeader
                icon={Trophy}
                title="Top performing calls"
                description="Highest deal scores in the window — open one to read the full transcript."
                className="px-5 pt-5"
              />
              <CardContent className="pt-0">
                {(!data.topCalls || data.topCalls.length === 0) ? (
                  <p className="text-xs text-ink-muted py-6">No scored calls yet. Scores appear after a call is summarised.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.topCalls.map(c => (
                      <li key={c.id}>
                        <Link
                          to={`/history?call=${c.id}`}
                          className="flex items-center gap-3 rounded-field border border-line bg-surface-3/50 px-3 py-2.5 hover:border-line-strong transition-colors"
                        >
                          <Avatar name={c.customerName} size="xs" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold text-ink truncate">{c.customerName}</span>
                            <span className="block text-[11px] text-ink-muted truncate">{c.product} · {formatDuration(c.duration || 0)}</span>
                          </span>
                          <StatusBadge status={c.status} />
                          <span className="font-mono text-xs text-warn tabular-nums shrink-0">{c.dealScore}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </LoadState>
    </Page>
  );
}

function BreakdownCard({ title, icon, rows = [], description }) {
  const max = Math.max(1, ...rows.map(r => r.calls));
  return (
    <Card>
      <SectionHeader icon={icon} title={title} description={description} className="px-5 pt-5" />
      <CardContent className="pt-0 space-y-3">
        {rows.length === 0 && <p className="text-xs text-ink-muted">Nothing recorded in this window.</p>}
        {rows.slice(0, 5).map(r => (
          <MeterRow
            key={r.name}
            name={r.name}
            value={r.calls}
            max={max}
            detail={`${r.calls} ${r.calls === 1 ? 'call' : 'calls'} · ${r.conversions} won · ${formatDuration(r.avgDuration || 0)}`}
          />
        ))}
      </CardContent>
    </Card>
  );
}
