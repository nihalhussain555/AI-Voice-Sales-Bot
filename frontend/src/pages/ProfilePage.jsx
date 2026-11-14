import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UserRound, KeyRound, Palette, Boxes, Bell, HardDrive, Save, Trash2, Check,
  RotateCcw, LogOut, ShieldCheck, CalendarClock
} from 'lucide-react';

import { api } from '../services/api.js';
import { useApp } from '../components/AppShell.jsx';
import { useAuth } from '../context/auth.jsx';
import { useWorkspace } from '../hooks/useWorkspace.js';
import { useTheme } from '../context/theme.jsx';
import { getSidebarCollapsed, setSidebarCollapsed, SIDEBAR_EVENT, LOCAL_DATA, clearLocalPreferences } from '../lib/profile.js';
import { buildNotifications, clearReadHistory, readIds, NOTIFICATIONS_EVENT } from '../lib/notifications.js';
import { validateName, validatePhone, validatePassword, validateUrl, firstError } from '../lib/validation.js';
import PasswordField from '../components/auth/PasswordField.jsx';
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

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export default function ProfilePage() {
  const { push: toast } = useToast();
  const { user, policy, applyUser, logout } = useAuth();
  const { openProductPicker, product } = useApp();
  const workspace = useWorkspace();
  const { theme, setTheme } = useTheme();

  const [form, setForm] = useState({ fullName: '', phone: '', avatarUrl: '' });
  const [errors, setErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(getSidebarCollapsed);
  const [seen, setSeen] = useState(readIds);
  const [confirmClear, setConfirmClear] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [savingPassword, setSavingPassword] = useState(false);

  const { data: callsData } = useQuery({ queryKey: ['calls'], queryFn: api.calls });
  const { data: leadsData } = useQuery({ queryKey: ['leads'], queryFn: api.leads });

  // The form is seeded from the account the server returned, and re-seeded
  // whenever that record changes, so a save elsewhere is never overwritten by a
  // stale draft on this page.
  useEffect(() => {
    if (!user) return;
    setForm({ fullName: user.fullName || '', phone: user.phone || '', avatarUrl: user.avatarUrl || '' });
    setErrors({});
  }, [user]);

  const feed = useMemo(
    () => buildNotifications({ calls: callsData?.calls || [], leads: leadsData?.leads || [] }),
    [callsData, leadsData]
  );
  const readCount = feed.filter(item => seen.has(item.id)).length;

  useEffect(() => {
    const syncSeen = () => setSeen(readIds());
    const syncSidebar = (event) => setNavCollapsed(event.detail);
    window.addEventListener(NOTIFICATIONS_EVENT, syncSeen);
    window.addEventListener(SIDEBAR_EVENT, syncSidebar);
    return () => {
      window.removeEventListener(NOTIFICATIONS_EVENT, syncSeen);
      window.removeEventListener(SIDEBAR_EVENT, syncSidebar);
    };
  }, []);

  const dirty =
    form.fullName.trim() !== (user?.fullName || '') ||
    form.phone.trim() !== (user?.phone || '') ||
    form.avatarUrl.trim() !== (user?.avatarUrl || '');

  const minLength = policy?.passwordMinLength ?? 8;

  const saveIdentity = async (event) => {
    event.preventDefault();
    if (savingProfile) return;
    const next = {
      fullName: validateName(form.fullName),
      phone: form.phone.trim() ? validatePhone(form.phone) : null,
      avatarUrl: form.avatarUrl.trim()
        ? validateUrl(form.avatarUrl, { field: 'Profile picture link' })
        : null
    };
    if (firstError(...Object.values(next))) {
      setErrors(next);
      return;
    }
    setErrors({});
    setSavingProfile(true);
    try {
      const data = await api.updateProfile({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        avatarUrl: form.avatarUrl.trim()
      });
      // The header menu reads the same record, so it must not keep the old name.
      applyUser(data.user);
      toast('Profile saved to your account.', 'success');
    } catch (err) {
      const server = {
        fullName: /name/i.test(err.message) ? err.message : null,
        phone: /phone/i.test(err.message) ? err.message : null,
        avatarUrl: /picture|link|url/i.test(err.message) ? err.message : null
      };
      if (firstError(...Object.values(server))) setErrors(server);
      else toast(err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    if (savingPassword) return;
    const next = {
      currentPassword: pw.currentPassword ? null : 'Your current password is required',
      newPassword: validatePassword(pw.newPassword, { minLength }),
      confirmPassword: pw.newPassword && pw.confirmPassword !== pw.newPassword ? 'Both passwords must match' : null
    };
    if (firstError(...Object.values(next))) {
      setPwErrors(next);
      return;
    }
    setPwErrors({});
    setSavingPassword(true);
    try {
      const data = await api.changePassword(pw);
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
      applyUser(data.user);
      toast(
        data.otherSessionsEnded
          ? `Password updated. ${data.otherSessionsEnded} other session${data.otherSessionsEnded > 1 ? 's' : ''} signed out.`
          : 'Password updated.',
        'success'
      );
    } catch (err) {
      if (err.status === 401) setPwErrors({ currentPassword: err.message });
      else if (/new password|password/i.test(err.message)) setPwErrors({ newPassword: err.message });
      else toast(err.message, 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const signOut = async () => {
    setConfirmSignOut(false);
    setSigningOut(true);
    await logout();
  };

  const removeCustomProduct = async () => {
    const target = removing;
    setRemoving(null);
    try {
      await workspace.removeCustomProduct(target.id);
      toast(`Removed “${target.name}” from your account.`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

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
        description="Your account, the security around it, and the preferences this device keeps. Everything on this page is saved to the server against your user record unless it says otherwise."
        meta={<Badge variant="success" dot>Authenticated</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="lg:col-span-2">
          <SectionHeader
            icon={UserRound}
            title="Account"
            description="Read from and written to your user record. The email it was created with is shown but cannot be changed here."
            className="px-5 pt-5"
          />
          <CardContent className="pt-0 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={form.fullName || user?.fullName} src={form.avatarUrl.trim() || user?.avatarUrl} size="lg" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-bold text-ink">{user?.fullName}</p>
                <p className="truncate text-[12px] text-ink-muted">{user?.email}</p>
                <p className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
                  <CalendarClock className="w-3.5 h-3.5" />
                  Account created {formatDate(user?.createdAt)}
                  {user?.updatedAt && user?.updatedAt !== user?.createdAt
                    ? <span className="text-ink-muted/70"> · updated {formatDate(user.updatedAt)}</span>
                    : null}
                </p>
              </div>
              <Badge variant={user?.status === 'active' ? 'success' : 'amber'}>{user?.status}</Badge>
            </div>

            <form onSubmit={saveIdentity} className="space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Full name" error={errors.fullName}>
                  <Input
                    value={form.fullName}
                    onChange={e => { setForm(f => ({ ...f, fullName: e.target.value })); setErrors(x => ({ ...x, fullName: null })); }}
                    maxLength={80}
                    autoComplete="name"
                    invalid={Boolean(errors.fullName)}
                  />
                </Field>
                <Field label="Phone" error={errors.phone} hint="Optional. Used for caller identification on outbound calls.">
                  <Input
                    value={form.phone}
                    onChange={e => { setForm(f => ({ ...f, phone: e.target.value })); setErrors(x => ({ ...x, phone: null })); }}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                    invalid={Boolean(errors.phone)}
                  />
                </Field>
              </div>
              <Field label="Profile picture link" error={errors.avatarUrl} hint="Optional https URL. Initials are shown while it is empty or if the image fails to load.">
                <Input
                  value={form.avatarUrl}
                  onChange={e => { setForm(f => ({ ...f, avatarUrl: e.target.value })); setErrors(x => ({ ...x, avatarUrl: null })); }}
                  placeholder="https://…/me.jpg"
                  invalid={Boolean(errors.avatarUrl)}
                />
              </Field>
              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" size="sm" loading={savingProfile} disabled={!dirty}>
                  {!savingProfile && (dirty ? <Save className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />)}
                  {dirty ? 'Save changes' : 'Saved'}
                </Button>
                {dirty && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setForm({ fullName: user?.fullName || '', phone: user?.phone || '', avatarUrl: user?.avatarUrl || '' }); setErrors({}); }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Revert
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <SectionHeader
            icon={KeyRound}
            title="Change password"
            description="Proving the old one signs every other device out and keeps this one."
            className="px-5 pt-5"
          />
          <CardContent className="pt-0">
            <form onSubmit={savePassword} className="space-y-3.5">
              <PasswordField
                label="Current password"
                autoComplete="current-password"
                value={pw.currentPassword}
                onChange={(v) => { setPw(p => ({ ...p, currentPassword: v })); setPwErrors(x => ({ ...x, currentPassword: null })); }}
                error={pwErrors.currentPassword}
                disabled={savingPassword}
              />
              <PasswordField
                label="New password"
                autoComplete="new-password"
                value={pw.newPassword}
                onChange={(v) => { setPw(p => ({ ...p, newPassword: v })); setPwErrors(x => ({ ...x, newPassword: null })); }}
                error={pwErrors.newPassword}
                hint={`At least ${minLength} characters, not letters only.`}
                showStrength
                disabled={savingPassword}
              />
              <PasswordField
                label="Confirm new password"
                autoComplete="new-password"
                value={pw.confirmPassword}
                onChange={(v) => { setPw(p => ({ ...p, confirmPassword: v })); setPwErrors(x => ({ ...x, confirmPassword: null })); }}
                error={pwErrors.confirmPassword}
                disabled={savingPassword}
              />
              <Button type="submit" size="sm" loading={savingPassword} disabled={!pw.currentPassword || !pw.newPassword}>
                Update password
              </Button>
            </form>
          </CardContent>
          <CardFooter>
            <HintText className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 w-3.5 h-3.5 shrink-0 text-primary" />
              Passwords are salted and bcrypt-hashed before storage, and are never returned by an
              endpoint or written to a log.
            </HintText>
          </CardFooter>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader
              icon={Palette}
              title="Appearance"
              description="Applies immediately and is kept on this device."
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
              icon={LogOut}
              title="Session"
              description={policy?.sessionTtlMinutes
                ? `Ends after ${policy.sessionTtlMinutes} minutes without activity, sooner if you change your password.`
                : 'Ends when the server-side session expires.'}
              className="px-5 pt-5"
            />
            <CardContent className="pt-0">
              <Row label="Signed in as" value={user?.email} />
              <Row label="Account id" value={user?.id} mono />
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" className="text-danger border-danger/40 hover:bg-danger/10" onClick={() => setConfirmSignOut(true)} disabled={signingOut}>
                <LogOut className="w-3.5 h-3.5" /> Sign out of this device
              </Button>
            </CardFooter>
          </Card>
        </div>

        <Card>
          <SectionHeader
            icon={Boxes}
            title="Custom products"
            description="Saved to your account, so the same pitches are available from any device you sign in on."
            actions={
              <Button variant="outline" size="sm" onClick={openProductPicker}>
                <Boxes className="w-3.5 h-3.5" /> Open picker
              </Button>
            }
            className="px-5 pt-5"
          />
          <CardContent className="pt-0">
            {workspace.customProducts.length === 0 ? (
              <HintText>
                None on your account yet. Catalog products come from the backend and are always
                available without being created here.
              </HintText>
            ) : (
              <div className="space-y-2">
                {workspace.customProducts.map(p => (
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
            icon={Bell}
            title="Notification inbox"
            description="Derived from your call records and customers — there is no separate inbox."
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

        <Card className="lg:col-span-2">
          <SectionHeader
            icon={HardDrive}
            title="Data stored on this device"
            description="Account data — calls, customers, recordings, products — lives on the server and is never copied into the browser. These are the only keys this console writes locally."
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
              Clearing these removes your theme, sidebar state and notification read history on this
              browser. Nothing else — and no server record — is affected.
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
        message={`“${removing?.name}” is deleted from your account. Calls already placed with it keep their transcript and summary.`}
        confirmLabel="Remove"
      />

      <ConfirmDialog
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        onConfirm={signOut}
        title="Sign out of this device?"
        message="The session is revoked on the server, so this browser stops sending your credentials until you sign in again. Other devices stay signed in."
        confirmLabel="Sign out"
      />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => { clearLocalPreferences(); window.location.reload(); }}
        title="Clear this device's preferences?"
        message="Theme, sidebar state and notification read history are removed and the page reloads. Your account and its records stay exactly as they are."
        confirmLabel="Clear and reload"
      />
    </Page>
  );
}

function Row({ label, value, tone, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{label}</span>
      <span className={`min-w-0 truncate text-xs ${mono ? 'font-mono' : 'font-semibold'} ${tone === 'warn' ? 'text-warn' : 'text-ink'}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}
