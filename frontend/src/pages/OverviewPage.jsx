import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell
} from 'recharts';
import {
  PhoneCall, CheckCircle2, PhoneIncoming, PhoneOff, Users, TrendingUp, Clock,
  MessageSquare, Play, FileSpreadsheet, ArrowRight, Activity, Bot, Sparkles
} from 'lucide-react';

import { api } from '../services/api.js';
import { useApp } from '../components/AppShell.jsx';
import { useThemeTokens } from '../context/theme.jsx';
import { formatDuration, groupByCustomer, relativeTime } from '../lib/customers.js';
import Page from '../components/shell/Page.jsx';
import { PageHeader } from '../components/ui/page-header.jsx';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '../components/ui/card.jsx';
import { StatCard } from '../components/ui/stat-card.jsx';
import { Badge, OutcomeBadge, StatusBadge } from '../components/ui/badge.jsx';
import { Button } from '../components/ui/button.jsx';
import { SkeletonCard, SkeletonTable } from '../components/ui/skeleton.jsx';
import { EmptyState, ErrorState } from '../components/ui/empty-state.jsx';
import { MeterRow, ProgressBar } from '../components/ui/progress.jsx';
import Avatar from '../components/ui/avatar.jsx';
import Tabs from '../components/ui/tabs.jsx';
import ChartTooltip from '../components/charts/ChartTooltip.jsx';

const VIEW_LINK = 'inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover transition-colors shrink-0';

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' }
];

const weekStart = (iso) => {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};

const shortDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });

// A 90-day window of single days is unreadable, so long ranges roll up to weeks.
function toSeries(daily = [], range) {
  if (range < 90) return daily.map(row => ({ ...row, label: shortDay(row.date) }));
  const map = new Map();
  for (const row of daily) {
    const key = weekStart(row.date);
    const bucket = map.get(key) || { date: key, calls: 0, conversions: 0 };
    bucket.calls += row.calls;
    bucket.conversions += row.conversions;
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).map(row => ({ ...row, label: `w/c ${shortDay(row.date)}` }));
}

export default function OverviewPage() {
  const { health, product } = useApp();
  const tokens = useThemeTokens();
  const [range, setRange] = useState(30);

  const analyticsQuery = useQuery({ queryKey: ['analytics', range], queryFn: () => api.analytics(range) });
  const callsQuery = useQuery({ queryKey: ['calls'], queryFn: api.calls });

  const data = analyticsQuery.data;
  const totals = data?.totals;
  const calls = useMemo(() => {
    const list = callsQuery.data?.calls || [];
    return [...list].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }, [callsQuery.data]);

  const recentCalls = calls.slice(0, 6);
  const customers = useMemo(() => groupByCustomer(calls), [calls]);
  const series = useMemo(() => toSeries(data?.daily, range), [data, range]);

  const outcomeSlices = useMemo(() => {
    if (!totals) return [];
    const answeredNoTalk = Math.max(0, totals.totalCalls - totals.successful - totals.failed);
    return [
      { name: 'Successful', value: totals.successful, tone: tokens.success },
      { name: 'Not reached', value: totals.failed, tone: tokens.danger },
      { name: 'No conversation', value: answeredNoTalk, tone: tokens.warn }
    ].filter(slice => slice.value > 0);
  }, [totals, tokens]);

  const agentPerformance = useMemo(() => {
    if (!totals) return [];
    return [
      { name: 'Engaged the pitch', value: totals.engagementRate, detail: `${totals.engagementRate}%`, tone: 'primary' },
      { name: 'Reached a decision maker', value: data?.phone?.attempts ? data.phone.reachRate : 0, detail: data?.phone?.attempts ? `${data.phone.reachRate}% of ${data.phone.attempts} dials` : 'no phone dials yet', tone: 'info' },
      { name: 'Asked for a demo', value: totals.totalCalls ? Math.round(((data?.funnel?.[3]?.count || 0) / totals.totalCalls) * 100) : 0, detail: `${data?.funnel?.[3]?.count || 0} demo+`, tone: 'violet' },
      { name: 'Converted', value: totals.conversionRate, detail: `${totals.converted} closed`, tone: 'success' }
    ];
  }, [totals, data]);

  const isLoading = analyticsQuery.isLoading;
  const noData = !isLoading && data && totals?.totalCalls === 0;

  return (
    <Page>
      <PageHeader
        description={
          health
            ? `Live view of what ${product?.name || 'the agent'} has been saying, who picked up and what it converted.`
            : 'Waiting for the backend to come online — every number below is read from stored call records.'
        }
        meta={
          <div className="flex items-center gap-2">
            <Badge dot variant={health ? (health.groqKeyConfigured ? 'emerald' : 'sky') : 'amber'}>
              {health ? (health.groqKeyConfigured ? 'Agent online' : 'Fallback engine') : 'Backend offline'}
            </Badge>
            {data?.window?.days && (
              <span className="text-[11px] font-semibold text-ink-muted">{data.window.days}-day window</span>
            )}
          </div>
        }
        actions={
          <>
            <Tabs items={RANGES} value={range} onChange={setRange} size="sm" ariaLabel="Reporting window" />
            <Link to="/agent">
              <Button size="sm"><Play className="w-3.5 h-3.5" /> Start a call</Button>
            </Link>
          </>
        }
      />

      {analyticsQuery.error && (
        <ErrorState
          className="mb-5"
          message={analyticsQuery.error.message}
          onRetry={() => analyticsQuery.refetch()}
        />
      )}

      {/* KPI grid — all eight figures come from /api/analytics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading || !totals ? (
          Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard icon={PhoneCall} label="Total calls" value={totals.totalCalls} tint="primary" hint={`${data.phone?.attempts || 0} on the phone line`} />
            <StatCard icon={CheckCircle2} label="Successful calls" value={totals.successful} tint="success" hint="held a real conversation" />
            <StatCard icon={PhoneIncoming} label="Answered calls" value={totals.connected} tint="info" hint="at least one exchange" />
            <StatCard icon={PhoneOff} label="Failed calls" value={totals.failed} tint="danger" hint="busy, no answer or dropped" />
            <StatCard icon={Users} label="Total customers" value={totals.customers} tint="violet" hint="unique people or numbers" />
            <StatCard icon={TrendingUp} label="Conversion rate" value={`${totals.conversionRate}%`} tint="electric" hint={`${totals.converted} converted`} />
            <StatCard icon={Clock} label="Average call duration" value={formatDuration(totals.avgDuration)} tint="warn" hint={`${totals.conversationTurns} transcript turns`} />
            <StatCard icon={MessageSquare} label="Total conversations" value={totals.conversationTurns} tint="muted" hint="messages exchanged" />
          </>
        )}
      </div>

      {noData ? (
        <Card className="mt-5">
          <CardContent className="py-6">
            <EmptyState
              icon={Sparkles}
              compact
              title="No calls in this window yet"
              message="Run a browser demo call, connect a Twilio number for live dialling, or import a customer list to build a calling workflow."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Link to="/agent"><Button size="sm"><Play className="w-3.5 h-3.5" /> Voice agent</Button></Link>
                  <Link to="/import"><Button size="sm" variant="outline"><FileSpreadsheet className="w-3.5 h-3.5" /> Import customers</Button></Link>
                </div>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Calling activity</CardTitle>
                  <CardDescription>
                    {range < 90 ? 'Calls and conversions per day' : 'Calls and conversions rolled up per week'}
                  </CardDescription>
                </div>
                <Link to="/analytics" className={VIEW_LINK}>
                  Deep dive <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={252}>
                  <AreaChart data={series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="callsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={tokens.primary} stopOpacity={0.42} />
                        <stop offset="100%" stopColor={tokens.primary} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="convFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={tokens.success} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={tokens.success} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={tokens.lineAlpha(0.6)} strokeDasharray="3 6" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: tokens.inkMuted }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={16}
                    />
                    <YAxis tick={{ fontSize: 10, fill: tokens.inkMuted }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: tokens.lineStrong, strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="calls" name="Calls" stroke={tokens.primary} strokeWidth={2.25} fill="url(#callsFill)" />
                    <Area type="monotone" dataKey="conversions" name="Converted" stroke={tokens.success} strokeWidth={2.25} fill="url(#convFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Success vs failure</CardTitle>
                  <CardDescription>How the {totals?.totalCalls || 0} attempts in this window ended</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {outcomeSlices.length === 0 ? (
                  <EmptyState compact icon={Activity} title="Nothing recorded" message="Call outcomes appear here as soon as the first call is stored." />
                ) : (
                  <>
                    <div className="relative">
                      <ResponsiveContainer width="100%" height={196}>
                        <PieChart>
                          <Pie
                            data={outcomeSlices}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={62}
                            outerRadius={88}
                            paddingAngle={3}
                            stroke="none"
                          >
                            {outcomeSlices.map(slice => <Cell key={slice.name} fill={slice.tone} />)}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-extrabold tabular-nums text-ink leading-none">
                          {totals ? Math.round((totals.successful / (totals.totalCalls || 1)) * 100) : 0}%
                        </span>
                        <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">connected</span>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {outcomeSlices.map(slice => (
                        <div key={slice.name} className="flex items-center gap-2 text-[12px]">
                          <span className="h-2 w-2 rounded-full" style={{ background: slice.tone }} />
                          <span className="text-ink-muted">{slice.name}</span>
                          <span className="ml-auto font-mono tabular-nums font-semibold text-ink">{slice.value}</span>
                        </div>
                      ))}
                      {data?.phone?.attempts > 0 && (
                        <ProgressBar
                          className="pt-2"
                          label="Phone reach rate"
                          value={data.phone.reached}
                          max={data.phone.attempts}
                          tone="info"
                        />
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Recent call activity</CardTitle>
                  <CardDescription>Newest stored calls, browser and phone together</CardDescription>
                </div>
                <Link to="/history" className={VIEW_LINK}>
                  All calls <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {callsQuery.isLoading ? (
                  <SkeletonTable rows={5} cols={4} />
                ) : recentCalls.length === 0 ? (
                  <EmptyState compact className="mx-5" icon={PhoneCall} title="No calls stored yet" message="Start a demo call to see activity here." />
                ) : (
                  <ul className="divide-y divide-line/70">
                    {recentCalls.map(call => (
                      <li key={call.id}>
                        <Link
                          to={`/history?call=${call.id}`}
                          className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/70"
                        >
                          <Avatar name={call.customerName || call.company} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-bold text-ink">
                              {call.customerName || call.company || 'Unknown prospect'}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                              {[call.product, call.channel === 'phone' ? (call.direction === 'inbound' ? 'inbound call' : 'outbound call') : 'browser demo', formatDuration(call.duration)].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <div className="hidden shrink-0 items-center gap-2 sm:flex">
                            {call.outcome && <OutcomeBadge outcome={call.outcome} />}
                            <StatusBadge status={call.status} />
                          </div>
                          <span className="w-14 shrink-0 text-right text-[11px] font-semibold tabular-nums text-ink-muted">
                            {relativeTime(call.timestamp)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>AI agent performance</CardTitle>
                    <CardDescription>Ratios across the selected window</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-6 animate-shimmer rounded-field bg-surface-2" />)}
                    </div>
                  ) : (
                    agentPerformance.map(row => (
                      <MeterRow
                        key={row.name}
                        name={row.name}
                        value={row.value}
                        max={100}
                        detail={row.detail}
                        tone={row.tone}
                      />
                    ))
                  )}
                  {totals?.avgDealScore > 0 && (
                    <div className="flex items-center gap-2 rounded-field border border-line bg-surface-3/60 px-3 py-2">
                      <Bot className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-[11px] font-semibold text-ink-soft">Average deal score</span>
                      <span className="ml-auto font-mono text-[13px] font-bold tabular-nums text-ink">{totals.avgDealScore}/100</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Customer interactions</CardTitle>
                    <CardDescription>Most recently contacted first</CardDescription>
                  </div>
                  <Link to="/customers" className={VIEW_LINK}>
                    CRM <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {customers.length === 0 ? (
                    <p className="text-xs text-ink-muted">No customers have been spoken to yet.</p>
                  ) : (
                    customers.slice(0, 5).map(row => (
                      <div key={row.key} className="flex items-center gap-3">
                        <Avatar name={row.name} size="xs" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-bold text-ink">{row.name}</p>
                          <p className="truncate text-[10px] text-ink-muted">
                            {row.calls} call{row.calls === 1 ? '' : 's'} · last {relativeTime(row.last?.timestamp)}
                          </p>
                        </div>
                        <StatusBadge status={row.best} />
                      </div>
                    ))
                  )}
                </CardContent>
                <CardFooter className="justify-between py-3">
                  <span className="text-[11px] text-ink-muted">{customers.length} customers</span>
                  <Link to="/import" className={VIEW_LINK}>
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Import a list
                  </Link>
                </CardFooter>
              </Card>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
