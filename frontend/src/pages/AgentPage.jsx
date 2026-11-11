import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bot, PhoneCall, Sparkles } from 'lucide-react';

import { api } from '../services/api.js';
import { useApp } from '../components/AppShell.jsx';
import Page from '../components/shell/Page.jsx';
import { PageHeader } from '../components/ui/page-header.jsx';
import { Badge } from '../components/ui/badge.jsx';
import Tabs from '../components/ui/tabs.jsx';
import DemoPanel from '../components/agent/DemoPanel.jsx';
import LivePanel from '../components/agent/LivePanel.jsx';

const MODES = [
  { value: 'demo', label: 'Browser demo', icon: Bot },
  { value: 'live', label: 'Live phone', icon: PhoneCall }
];

export default function AgentPage() {
  const { health, product, products, selectProduct } = useApp();
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'live' ? 'live' : 'demo');

  const { data: phoneConfig } = useQuery({
    queryKey: ['phone-config'],
    queryFn: () => api.phoneConfig().catch(() => null),
    retry: false,
    staleTime: 20000
  });

  // A product chosen from global search arrives as ?product=id.
  useEffect(() => {
    const wanted = params.get('product');
    if (!wanted) return;
    const match = products.find(item => item.id === wanted);
    if (match && match.id !== product?.id) selectProduct(match);
    params.delete('product');
    setParams(params, { replace: true });
  }, [params, products, product, selectProduct, setParams]);

  const online = Boolean(health);
  const engineLabel = online
    ? health.groqKeyConfigured ? `Groq · ${health.chatModel}` : 'Built-in demo engine'
    : 'Backend unreachable';

  return (
    <Page>
      <PageHeader
        description={
          mode === 'demo'
            ? 'Talk to the agent through your browser microphone. Identical conversation logic to the phone line, without the call charges.'
            : 'Dial a real number. Twilio streams live audio to the same sales engine, and the call is archived with a transcript and summary.'
        }
        meta={
          <>
            <Badge dot variant={online ? 'emerald' : 'rose'}>{online ? 'Agent online' : 'Agent offline'}</Badge>
            <Badge variant="slate"><Sparkles className="h-3 w-3" /> {engineLabel}</Badge>
            <Badge dot variant={phoneConfig?.mode === 'live' ? 'sky' : 'amber'}>
              {phoneConfig == null
                ? 'Checking line'
                : phoneConfig.mode === 'live'
                  ? `Line ready · ${phoneConfig.activeCalls ?? 0}/${phoneConfig.maxConcurrentCalls ?? 0} busy`
                  : phoneConfig.inboundReady
                    ? 'Inbound only'
                    : 'Line not configured'}
            </Badge>
            {product && <Badge variant="primary">{product.name}</Badge>}
          </>
        }
        actions={<Tabs items={MODES} value={mode} onChange={setMode} ariaLabel="Calling mode" />}
      />

      {mode === 'demo' ? <DemoPanel /> : <LivePanel />}
    </Page>
  );
}
