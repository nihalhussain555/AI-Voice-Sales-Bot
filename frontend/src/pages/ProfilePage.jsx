import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UserRound, Palette, Boxes, Bell, HardDrive, Save, Trash2, Check, RotateCcw
} from 'lucide-react';

import { api } from '../services/api.js';
import { useApp } from '../components/AppShell.jsx';
import { useTheme } from '../context/theme.jsx';
import {
  DEFAULT_PROFILE, getProfile, saveProfile, getCustomProducts, saveCustomProducts,
  getSidebarCollapsed, setSidebarCollapsed, SIDEBAR_EVENT, CUSTOM_PRODUCTS_EVENT,
  LOCAL_DATA, clearLocalWorkspace
} from '../lib/profile.js';
import { buildNotifications, clearReadHistory, readIds, NOTIFICATIONS_EVENT } from '../lib/notifications.js';
import Page from '../components/shell/Page.jsx';
import { PageHeader, SectionHeader } from '../components/ui/page-header.jsx';
import { Card, CardContent, CardFooter } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import Avatar from '../components/ui/avatar.jsx';
import { Field, Input, HintText } from '../components/ui/input.jsx';
import { Toggle } from '../components/ui/toggle.jsx';
import Tabs from '../components/ui/tabs.jsx';
import { Table, THead, Th, Td, Tr } from '../components/ui/table.jsx';
import { ConfirmDialog } from '../components/ui/dialog.jsx';
import { useToast } from '../components/ui/toast.jsx';

export default function ProfilePage() {
  const { push: toast } = useToast();
  const { openProductPicker, product } = useApp();
  const { theme, setTheme } = useTheme();

  const [saved, setSaved] = useState(getProfile);
  const [form, setForm] = useState(saved);
  const [navCollapsed, setNavCollapsed] = useState(getSidebarCollapsed);
  const [customTick, setCustomTick] = useState(0);
  const [seen, setSeen] = useState(readIds);
  const [confirmClear, setConfirmClear] = useState(false);
  const [removing, setRemoving] = useState(null);

  const { data: callsData } = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const { data: leadsData } = useQuery({ queryKey: ['leads'], queryFn: api.leads });

  const customProducts = useMemo(() => getCustomProducts(), [customTick]);

  // The bell owns this feed in AppShell; both read it from the same records, so
  // the counts here can never disagree with the ones in the header.
  const feed = useMemo(
    () => buildNotifications({ calls: callsData?.calls || [], leads: leadsData?.leads || [] }),
    [callsData, leadsData]
  );
  const readCount = feed.filter(item => seen.has(item.id)).length;

  useEffect(() => {
    const syncSeen = () => setSeen(readIds());
    const syncProducts = () => setCustomTick(t => t + 1);
    const syncSidebar = (event) => setNavCollapsed(event.detail);
    window.addEventListener(NOTIFICATIONS_EVENT, syncSeen);
    window.addEventListener(SIDEBAR_EVENT, syncSidebar);
    window.addEventListener(CUSTOM_PRODUCTS_EVENT, syncProducts);
    return () => {
      window.removeEventListener(NOTIFICATIONS_EVENT, syncSeen);
      window.removeEventListener(SIDEBAR_EVENT, syncSidebar);
      window.removeEventListener(CUSTOM_PRODUCTS_EVENT, syncProducts);
    };
  }, []);

  const dirty = form.name !== saved.name || form.role !== saved.role;

  const saveIdentity = () => {
    if (!form.name.trim()) {
      toast('A name is required.', 'error');
      return;
    }
    setSaved(saveProfile({ name: form.name.trim(), role: form.role.trim() || DEFAULT_PROFILE.role }));
    toast('Profile updated on this device', 'success');
  };

  const removeCustomProduct = () => {
    saveCustomProducts(getCustomProducts().filter(p => p.id !== removing.id));
    setCustomTick(t => t + 1);
    toast(`Removed “${removing.name}” from this browser`, 'success');
    setRemoving(null);
  };

  // Read at render time so the table always agrees with the actions taken on it.
  const storedKeys = (() => {
    try {
      return new Set(Object.keys(localStorage));
    } catch {
      return new Set();
    }
  })();

  return (
    <Page className="max-w-5xl">
      <PageHeader
        description="Preferences for this workspace. VoicePitch AI has no sign-in in this build, so nothing here creates an account or reaches the server — these values live in this browser and can be cleared below."
        meta={<Badge variant="slate">This browser only</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader
            icon={UserRound}
            title="Operator identity"
            description="Shown in the top-right menu on this device. Calls are stored without an owner because the server has no user accounts."
            className="px-5 pt-5"
          />
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-center gap-3">
              <Avatar name={form.name || DEFAULT_PROFILE.name} size="lg" />
              <HintText>
                Initials are generated from the name. There is no photo upload because there is no
                user record to attach one to.
              </HintText>
            </div>
            <Field label="Name">
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                maxLength={48}
                placeholder="Your name"
              />
            </Field>
            <Field label="Role" hint="Free text, displayed next to your name only.">
              <Input
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                maxLength={32}
                placeholder="Growth, Sales, Founder…"
              />
            </Field>
          </CardContent>
          <CardFooter>
            <Button size="sm" onClick={saveIdentity} disabled={!dirty}>
              <Save className="w-3.5 h-3.5" /> {dirty ? 'Save changes' : 'Saved'}
            </Button>
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setForm(saved)}>
                <RotateCcw className="w-3.5 h-3.5" /> Revert
              </Button>
            )}
          </CardFooter>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader
              icon={Palette}
              title="Appearance"
              description="Applies immediately and is kept after a reload."
              className="px-5 pt-5"
            />
            <CardContent className="pt-0 space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">Theme</p>
                <Tabs
                  ariaLabel="Theme"
                  value={theme}
                  onChange={setTheme}
                  items={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
                />
              </div>
              <Toggle
                id="sidebar-collapsed"
                label="Collapse the navigation rail"
                description="Icons only with tooltips. The menu still exists in exactly one place."
                checked={navCollapsed}
                onChange={(next) => { setNavCollapsed(next); setSidebarCollapsed(next); }}
              />
            </CardContent>
          </Card>

          <Card>
            <SectionHeader
              icon={Bell}
              title="Notification inbox"
              description="Derived from call records and customers — there is no separate inbox."
              className="px-5 pt-5"
            />
            <CardContent className="pt-0 space-y-1">
              <Row label="Recent entries" value={feed.length} />
              <Row label="Already read" value={readCount} />
              <Row label="Unread" value={feed.length - readCount} tone="warn" />
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { clearReadHistory(); toast('Read history cleared — recent events count as unread again.', 'success'); }}
                disabled={!readCount}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset read history
              </Button>
            </CardFooter>
          </Card>
        </div>

        <Card>
          <SectionHeader
            icon={Boxes}
            title="Custom products"
            description="Built in the product picker and pitched exactly like a catalog product."
            actions={
              <Button variant="outline" size="sm" onClick={openProductPicker}>
                <Boxes className="w-3.5 h-3.5" /> Open picker
              </Button>
            }
            className="px-5 pt-5"
          />
          <CardContent className="pt-0">
            {customProducts.length === 0 ? (
              <HintText>
                None on this device yet. Catalog products come from the backend and are always
                available without being stored here.
              </HintText>
            ) : (
              <div className="space-y-2">
                {customProducts.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-field border border-line bg-surface-3/50 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-ink">{p.name}</p>
                      <p className="truncate text-[11px] text-ink-muted">
                        {p.tagline} · {p.features?.length || 0} features
                      </p>
                    </div>
                    {product?.id === p.id && <Badge variant="primary">Active</Badge>}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-ink-muted hover:text-danger"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => setRemoving(p)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <SectionHeader
            icon={HardDrive}
            title="Data stored on this device"
            description="Every key this console writes, and whether it currently holds a value."
            className="px-5 pt-5"
          />
          <CardContent className="pt-0">
            <Table>
              <THead>
                <tr>
                  <Th>Key</Th>
                  <Th>Holds</Th>
                  <Th className="text-right">Status</Th>
                </tr>
              </THead>
              <tbody>
                {LOCAL_DATA.map(({ key, label }) => (
                  <Tr key={key}>
                    <Td className="font-mono text-[11px] whitespace-nowrap">{key}</Td>
                    <Td className="text-ink-soft">{label}</Td>
                    <Td className="text-right">
                      {storedKeys.has(key)
                        ? <Badge variant="success"><Check className="w-3 h-3" /> Set</Badge>
                        : <Badge variant="slate">Empty</Badge>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <HintText className="mt-3">
              Calls, customers and recordings belong to the backend and are never copied into the
              browser. Clearing this device does not touch them.
            </HintText>
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-danger border-danger/40 hover:bg-danger/10"
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear local preferences
            </Button>
          </CardFooter>
        </Card>
      </div>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={removeCustomProduct}
        title="Remove custom product?"
        message={`“${removing?.name}” is deleted from this browser only. Calls already placed with it keep their transcript and summary.`}
        confirmLabel="Remove"
      />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => { clearLocalWorkspace(); window.location.reload(); }}
        title="Clear this device's preferences?"
        message="Name, theme, selected product, custom products, sidebar state and notification read history are removed and the page reloads. Backend records stay exactly as they are."
        confirmLabel="Clear and reload"
      />
    </Page>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-line/60 last:border-0">
      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{label}</span>
      <span className={`text-xs font-mono ${tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{value}</span>
    </div>
  );
}
