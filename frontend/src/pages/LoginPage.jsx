import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg, #f5f5f5)'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2.5rem',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        color: '#1a1a1a'
      }}>
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem', color: '#1a1a1a' }}>
            DocuAgent
          </h1>
          <p style={{ color: '#666', fontSize: '0.875rem' }}>
            Jelentkezz be a folytatáshoz
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: '#1a1a1a' }}>
              Felhasználónév (email cím)
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="pl. nev@ceg.hu"
              required
              style={{
                width: '100%', padding: '0.625rem 0.75rem',
                border: '1px solid #e0e0e0', borderRadius: '8px',
                fontSize: '0.875rem', boxSizing: 'border-box',
                color: '#000000', backgroundColor: '#ffffff', outline: 'none'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: '#1a1a1a' }}>
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
                border: '1px solid #e0e0e0', borderRadius: '8px',
                fontSize: '0.875rem', boxSizing: 'border-box',
                color: '#000000', backgroundColor: '#ffffff', outline: 'none'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem',
              color: '#dc2626', fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '0.75rem',
              background: loading ? '#94a3b8' : '#2563eb',
              color: 'white', border: 'none', borderRadius: '8px',
              fontSize: '0.875rem', fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Bejelentkezés...' : 'Bejelentkezés'}
          </button>
        </form>
      </div>
    </div>
  );
}
