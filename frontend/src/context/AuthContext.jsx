import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,            setUser]            = useState(null);
  const [tenant,          setTenant]          = useState(null);
  const [token,           setToken]           = useState(() => localStorage.getItem('docuagent_token'));
  const [loading,         setLoading]         = useState(true);
  const [onboardingDone,  setOnboardingDone]  = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  useEffect(() => {
    if (token) {
      fetchMe();
    } else {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  async function fetchMe() {
    try {
      const res = await fetch(`${apiUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setTenant(data.tenant);
        await checkOnboarding(token);
      } else {
        logout();
      }
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }

  async function checkOnboarding(tok) {
    try {
      const res = await fetch(`${apiUrl}/api/onboarding/state`, {
        headers: { Authorization: `Bearer ${tok}` }
      });
      if (res.ok) {
        const json = await res.json();
        setOnboardingDone(json.onboarding?.is_complete === true);
      }
    } catch {
      // backend offline: treat as done so app still loads
      setOnboardingDone(true);
    } finally {
      setOnboardingChecked(true);
    }
  }

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Bejelentkezés sikertelen');
    }
    const data = await res.json();
    localStorage.setItem('docuagent_token', data.access_token);
    setToken(data.access_token);
    setUser(data.user);
    setTenant(data.tenant);
    await checkOnboarding(data.access_token);
    return data;
  }, [apiUrl]); // eslint-disable-line

  const logout = useCallback(() => {
    localStorage.removeItem('docuagent_token');
    setToken(null);
    setUser(null);
    setTenant(null);
    setOnboardingDone(false);
    setOnboardingChecked(false);
  }, []);

  const authFetch = useCallback(async (url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, { ...options, headers });
  }, [token]);

  // Called by OnboardingPage after /complete
  const setOnboardingComplete = useCallback((val = true) => {
    setOnboardingDone(val);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, tenant, token, loading,
      login, logout, authFetch,
      onboardingDone, onboardingChecked, setOnboardingComplete,
      isAdmin: user?.role === 'admin',
      isAgent: user?.role === 'agent' || user?.role === 'admin',
      isDemo:  tenant?.slug === 'demo',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
