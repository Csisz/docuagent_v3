import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setError('');
    setDemoLoading(true);
    try {
      await login('demo@agentify.hu', 'demo1234');
    } catch (err) {
      setError('A demo fiók nem elérhető. Futtasd a seed_demo.py scriptet.');
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#050d18',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        padding: '0 1rem',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 10,
            background: '#1a56db', marginBottom: '0.75rem',
          }}>
            <svg viewBox="0 0 16 16" fill="none" style={{ width: 20, height: 20 }}>
              <path d="M3 8h5M9 4l4 4-4 4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="4.5" cy="8" r="1.5" fill="white"/>
            </svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: '0.25rem' }}>
            DocuAgent
          </div>
          <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>
            v3 · Enterprise
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: '#0d1b2e',
          borderRadius: 14,
          padding: '2rem',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: '#e2e8f0', marginBottom: '0.25rem' }}>
            Bejelentkezés
          </h2>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: '1.5rem' }}>
            Add meg a hozzáférési adataidat
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b',
                marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                Email cím
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nev@ceg.hu"
                required
                style={{
                  width: '100%', padding: '0.625rem 0.75rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, fontSize: 13,
                  color: '#e2e8f0', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b',
                marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                Jelszó
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%', padding: '0.625rem 0.75rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, fontSize: 13,
                  color: '#e2e8f0', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.25)',
                borderRadius: 8, padding: '0.625rem 0.875rem',
                marginBottom: '1rem', color: '#f87171', fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || demoLoading}
              style={{
                width: '100%', padding: '0.688rem',
                background: loading ? 'rgba(26,86,219,0.5)' : '#1a56db',
                color: 'white', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginBottom: '0.75rem',
              }}
            >
              {loading ? 'Bejelentkezés...' : 'Bejelentkezés'}
            </button>
          </form>

          {/* Elválasztó */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            marginBottom: '0.75rem',
          }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            <span style={{ fontSize: 11, color: '#64748b' }}>vagy</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
          </div>

          {/* Demo gomb */}
          <button
            type="button"
            onClick={handleDemo}
            disabled={loading || demoLoading}
            style={{
              width: '100%', padding: '0.625rem',
              background: demoLoading ? 'rgba(255,120,32,0.15)' : 'rgba(255,120,32,0.1)',
              color: demoLoading ? 'rgba(255,120,32,0.6)' : '#ff7820',
              border: '1px solid rgba(255,120,32,0.3)',
              borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: demoLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!demoLoading) e.currentTarget.style.background = 'rgba(255,120,32,0.18)' }}
            onMouseLeave={e => { if (!demoLoading) e.currentTarget.style.background = 'rgba(255,120,32,0.1)' }}
          >
            {demoLoading ? '⏳ Belépés...' : '▶ Demo megtekintése'}
          </button>

          <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', marginTop: '0.625rem' }}>
            demo@agentify.hu · az adatok 24 óránként visszaállnak
          </div>
        </div>
      </div>
    </div>
  );
}
