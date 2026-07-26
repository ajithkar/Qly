/**
 * Session state and permission resolution.
 *
 * Permissions come from the server on every /auth/me call rather than being
 * derived client-side, so a role change or suspension takes effect on the
 * next request instead of lingering in a stale token claim. UI guards mirror
 * the API guards — they are a usability affordance, never the security
 * boundary. The server rejects the call regardless of what the UI renders.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { auth } from '@/api/endpoints';
import { onSessionExpired, tokenStore } from '@/api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [principal, setPrincipal] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    if (!tokenStore.access) {
      setPrincipal(null);
      setLoading(false);
      return;
    }
    try {
      setPrincipal(await auth.me());
    } catch {
      tokenStore.clear();
      setPrincipal(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
    return onSessionExpired(() => setPrincipal(null));
  }, [loadSession]);

  const login = useCallback(async (credentials) => {
    const pair = await auth.login(credentials);
    tokenStore.set(pair);
    const who = await auth.me();
    setPrincipal(who);
    return who;
  }, []);

  const adoptTokens = useCallback(async (pair) => {
    tokenStore.set(pair);
    const who = await auth.me();
    setPrincipal(who);
    return who;
  }, []);

  const logout = useCallback(async () => {
    const refresh = tokenStore.refresh;
    try {
      if (refresh) await auth.logout(refresh);
    } catch {
      // A failed logout call must not trap the user in a session.
    }
    tokenStore.clear();
    setPrincipal(null);
  }, []);

  const value = useMemo(() => {
    const granted = new Set(principal?.permissions ?? []);
    return {
      principal,
      loading,
      login,
      logout,
      adoptTokens,
      reload: loadSession,
      isAuthenticated: Boolean(principal),
      /** @param {string} permission e.g. "queues:update" */
      can: (permission) => granted.has(permission),
      canAny: (permissions) => permissions.some((p) => granted.has(p)),
    };
  }, [principal, loading, login, logout, adoptTokens, loadSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = { children: PropTypes.node };

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
