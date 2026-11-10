// Analytics aggregation over the call history.

import { db } from '../models/db.js';
import { outcomeLabel } from '../utils/phone.js';

const STATUSES = ['Converted', 'Demo Requested', 'Interested', 'Follow-up Required', 'Not Interested', 'No Response'];
const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Won', 'Lost'];

function inRange(call, from, to) {
  const t = new Date(call.timestamp).getTime();
  return (!from || t >= from) && (!to || t <= to);
}

function dayKey(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

export function buildAnalytics({ days = 30, from = null, to = null, calls = null, leads = [] } = {}) {
  if (!calls) calls = db.getCalls();

  let fromTs = from ? new Date(from).getTime() : null;
  let toTs = to ? new Date(to).getTime() : null;
  if (!fromTs && days > 0) {
    fromTs = Date.now() - days * 24 * 3600 * 1000;
  }

  const scoped = calls.filter(c => inRange(c, fromTs, toTs));

  const totalCalls = scoped.length;
  const connected = scoped.filter(c => (c.transcript || []).length > 0).length;
  const converted = scoped.filter(c => c.status === 'Converted').length;
  const demoed = scoped.filter(c => c.status === 'Demo Requested').length;
  const engaged = scoped.filter(c => (c.transcript || []).filter(m => m.sender === 'customer').length >= 2).length;

  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
  const avgDuration = avg(scoped.map(c => c.duration || 0));
  const avgDealScore = avg(scoped.map(c => c.summary?.dealScore).filter(v => typeof v === 'number'));

  // Status distribution
  const statusDistribution = STATUSES.map(status => ({
    status,
    count: scoped.filter(c => c.status === status).length
  }));

  // Per-day series (calls + conversions) across the window
  const perDay = new Map();
  for (const c of scoped) {
    const k = dayKey(c.timestamp);
    if (!perDay.has(k)) perDay.set(k, { date: k, calls: 0, conversions: 0, dealScoreSum: 0, scoredCount: 0 });
    const row = perDay.get(k);
    row.calls += 1;
    if (c.status === 'Converted') row.conversions += 1;
    if (typeof c.summary?.dealScore === 'number') {
      row.dealScoreSum += c.summary.dealScore;
      row.scoredCount += 1;
    }
  }
  const daily = [...perDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({
      date: r.date,
      calls: r.calls,
      conversions: r.conversions,
      avgDealScore: r.scoredCount ? Math.round(r.dealScoreSum / r.scoredCount) : 0
    }));

  // Breakdown helpers
  const groupBy = (list, keyFn) => {
    const map = new Map();
    for (const c of list) {
      const k = keyFn(c) || 'Unknown';
      if (!map.has(k)) map.set(k, { name: k, calls: 0, conversions: 0, durationSum: 0 });
      const g = map.get(k);
      g.calls += 1;
      if (c.status === 'Converted') g.conversions += 1;
      g.durationSum += c.duration || 0;
    }
    return [...map.values()]
      .map(g => ({ ...g, avgDuration: g.calls ? Math.round(g.durationSum / g.calls) : 0 }))
      .sort((a, b) => b.calls - a.calls);
  };

  const phoneCalls = scoped.filter(c => c.channel === 'phone');
  const byProduct = groupBy(scoped, c => c.product);
  const byLanguage = groupBy(scoped, c => c.language);
  const byChannel = groupBy(scoped, c => c.channel || 'browser');
  // How real phone attempts actually ended — reached, busy, no answer, failed.
  const byOutcome = groupBy(phoneCalls, c => outcomeLabel(c.outcome));
  const byDirection = groupBy(phoneCalls, c => (c.direction === 'inbound' ? 'Inbound' : 'Outbound'));

  // Conversion funnel (browser + phone combined)
  const funnel = [
    { stage: 'Called', count: totalCalls },
    { stage: 'Engaged', count: engaged },
    { stage: 'Interested+', count: scoped.filter(c => ['Interested', 'Demo Requested', 'Converted'].includes(c.status)).length },
    { stage: 'Demo', count: demoed + converted },
    { stage: 'Converted', count: converted }
  ];

  // Lead pipeline snapshot
  const leadPipeline = LEAD_STATUSES.map(s => ({
    status: s,
    count: leads.filter(l => (l.pipelineStatus || 'New') === s).length
  }));

  const topCalls = [...scoped]
    .filter(c => typeof c.summary?.dealScore === 'number')
    .sort((a, b) => b.summary.dealScore - a.summary.dealScore)
    .slice(0, 5)
    .map(c => ({
      id: c.id,
      customerName: c.customerName,
      status: c.status,
      dealScore: c.summary.dealScore
    }));

  const UNREACHED = ['busy', 'no-answer', 'canceled', 'rejected', 'failed', 'not-callable'];
  const phoneReach = phoneCalls.filter(c => c.outcome === 'completed').length;
  const phoneStats = {
    attempts: phoneCalls.length,
    reached: phoneReach,
    unanswered: phoneCalls.filter(c => UNREACHED.includes(c.outcome)).length,
    reachRate: phoneCalls.length ? Math.round((phoneReach / phoneCalls.length) * 100) : 0
  };

  return {
    window: { from: fromTs ? new Date(fromTs).toISOString() : null, to: toTs ? new Date(toTs).toISOString() : null, days: from ? null : days },
    totals: {
      totalCalls,
      connected,
      converted,
      conversionRate: totalCalls ? Math.round((converted / totalCalls) * 100) : 0,
      engagementRate: totalCalls ? Math.round((engaged / totalCalls) * 100) : 0,
      avgDuration,
      avgDealScore
    },
    phone: phoneStats,
    statusDistribution,
    daily,
    byProduct,
    byLanguage,
    byChannel,
    byOutcome,
    byDirection,
    funnel,
    leadPipeline,
    topCalls
  };
}
