// The single place the SPA knows who is signed in.
//
// The session itself is an HttpOnly cookie the browser owns, so this context
// never holds a token — it holds the account record and one of three states:
// 'loading' (bootstrap probe in flight), 'authenticated', 'anonymous'. Routing
// guards read `status`, never `user`, so a render can never mistake "not yet
// known" for "not signed in" and bounce a valid user to the login page.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { api, setUnauthorizedHandler } from '../services/api.js';

const AuthCtx = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  // Live server-side rules (minimum password length, whether signup is open,
  // whether reset emails can be delivered) so the forms never disagree with the API.
  const [policy, setPolicy] = useState(null);
  // Set when a session ended underneath the user, so the login page can explain
  // the redirect instead of appearing to reject good credentials.
  const [sessionEnded, setSessionEnded] = useState(false);

  const signedOutRef = useRef(false);

  const forgetWorkspace = useCallback(() => {
    // Cached calls, customers and analytics belong to the account that just
    // signed out. Leaving them would flash somebody else's data at the next one.
    queryClient.clear();
  }, [queryClient]);

  const endSession = useCallback(({ expired = false, to = '/login' } = {}) => {
    setUser(null);
    setStatus('anonymous');
    signedOutRef.current = true;
    forgetWorkspace();
    if (expired) setSessionEnded(true);
    navigate(to, { replace: true });
  }, [navigate, forgetWorkspace]);

  // Any workspace request that comes back 401 means the cookie died while the
  // tab was open — idle timeout, logout in another window, or a password change.
  useEffect(() => {
    setUnauthorizedHandler((err) => {
      if (signedOutRef.current) return;
      endSession({ expired: err.code === 'session_expired' });
    });
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  // Bootstrap: ask the server who this browser is.
  useEffect(() => {
    let alive = true;
    api.authConfig()
      .then((cfg) => { if (alive) setPolicy(cfg); })
      .catch(() => { /* the forms fall back to their own defaults */ });

    api.me()
      .then((data) => {
        if (!alive) return;
        setUser(data.user);
        setStatus('authenticated');
        signedOutRef.current = false;
      })
      .catch(() => { if (alive) setStatus('anonymous'); });

    return () => { alive = false; };
  }, []);

  // A session can lapse while the tab sits in the background. Re-checking on
  // focus means the first click after lunch redirects, rather than a form
  // submission failing with a confusing error.
  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || signedOutRef.current) return;
      api.me()
        .then((data) => setUser(data.user))
        .catch(() => endSession({ expired: true }));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status, endSession]);

  const login = useCallback(async ({ email, password, remember }) => {
    const data = await api.login({ email, password, remember });
    forgetWorkspace();
    setUser(data.user);
    setStatus('authenticated');
    signedOutRef.current = false;
    setSessionEnded(false);
    return data.user;
  }, [forgetWorkspace]);

  const register = useCallback(async (details) => {
    const data = await api.register(details);
    forgetWorkspace();
    setUser(data.user);
    setStatus('authenticated');
    signedOutRef.current = false;
    return data.user;
  }, [forgetWorkspace]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // The local view is cleared even if the request failed: an unreachable
      // server must not strand the user inside a signed-in shell.
      endSession({ to: '/login' });
    }
  }, [endSession]);

  const applyUser = useCallback((next) => setUser(prev => (prev ? { ...prev, ...next } : next)), []);

  const value = useMemo(() => ({
    status,
    user,
    policy,
    sessionEnded,
    clearSessionEnded: () => setSessionEnded(false),
    login,
    register,
    logout,
    applyUser,
    isAuthed: status === 'authenticated'
  }), [status, user, policy, sessionEnded, login, register, logout, applyUser]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
