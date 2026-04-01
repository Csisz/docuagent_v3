import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ChatPage() {
  const { authFetch } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const [sessions, setSessions]   = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => { loadSessions(); }, []); // eslint-disable-line
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadSessions() {
    try {
      const res = await authFetch(`${apiUrl}/api/chat/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch {}
  }

  async function loadSession(id) {
    setSessionId(id);
    try {
      const res = await authFetch(`${apiUrl}/api/chat/sessions/${id}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {}
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput('');
    setLoading(true);

    setMessages(prev => [...prev, { role: 'user', content: question, _temp: true }]);

    try {
      const res = await authFetch(`${apiUrl}/api/chat/message`, {
        method: 'POST',
        body: JSON.stringify({ question, session_id: sessionId })
      });
      const data = await res.json();

      if (!sessionId) {
        setSessionId(data.session_id);
        loadSessions();
      }

      setMessages(prev => [
        ...prev.filter(m => !m._temp),
        { role: 'user', content: question },
        {
          role: 'assistant',
          content: data.answer,
          sources: data.sources,
          confidence: data.confidence,
          fallback: data.fallback
        }
      ]);
    } catch {
      setMessages(prev => prev.filter(m => !m._temp));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', fontFamily: 'inherit', overflow: 'hidden' }}>
      {/* Session sidebar */}
      <div style={{
        width: '220px', borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', padding: '0.75rem', gap: '0.375rem',
        overflowY: 'auto', flexShrink: 0
      }}>
        <button
          onClick={() => { setSessionId(null); setMessages([]); }}
          style={{
            padding: '0.5rem 0.75rem', background: '#1a56db', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.5rem'
          }}
        >
          + Új kérdés
        </button>
        <div style={{ fontSize: '0.6875rem', color: '#666', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 0.25rem', marginBottom: '0.25rem' }}>
          Előzmények
        </div>
        {sessions.length === 0 && (
          <div style={{ fontSize: '0.75rem', color: '#555', padding: '0.5rem 0.25rem' }}>
            Még nincs előzmény
          </div>
        )}
        {sessions.map(s => (
          <button key={s.id} onClick={() => loadSession(s.id)} style={{
            padding: '0.5rem 0.625rem', textAlign: 'left',
            background: s.id === sessionId ? 'rgba(26,86,219,0.15)' : 'transparent',
            border: s.id === sessionId ? '1px solid rgba(26,86,219,0.4)' : '1px solid transparent',
            borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem',
            color: s.id === sessionId ? '#93b4ff' : '#888',
            lineHeight: 1.3
          }}>
            {s.title || 'Névtelen session'}
            {s.message_count > 0 && (
              <span style={{ display: 'block', fontSize: '0.6875rem', color: '#555', marginTop: '0.125rem' }}>
                {s.message_count} üzenet
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '1.25rem',
          display: 'flex', flexDirection: 'column', gap: '0.875rem'
        }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#555', marginTop: '4rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📚</div>
              <p style={{ fontSize: '0.9375rem', marginBottom: '0.5rem' }}>Kérdezz a feltöltött dokumentumokból!</p>
              <p style={{ fontSize: '0.8125rem', color: '#444' }}>Az AI a belső tudásbázis alapján válaszol.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '72%'
            }}>
              <div style={{
                padding: '0.75rem 1rem',
                background: msg.role === 'user' ? '#1a56db' : 'rgba(255,255,255,0.05)',
                color: msg.role === 'user' ? 'white' : '#d1d5db',
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.09)' : 'none',
                fontSize: '0.875rem', lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
                opacity: msg._temp ? 0.6 : 1
              }}>
                {msg.content}
              </div>
              {msg.sources?.length > 0 && (
                <div style={{ marginTop: '0.375rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                  {msg.sources.map((s, j) => (
                    <span key={j} style={{
                      fontSize: '0.6875rem', padding: '0.125rem 0.5rem',
                      background: 'rgba(26,86,219,0.15)', color: '#93b4ff',
                      borderRadius: '999px', border: '1px solid rgba(26,86,219,0.3)'
                    }}>
                      📄 {s.filename} {(s.score * 100).toFixed(0)}%
                    </span>
                  ))}
                  {msg.fallback && (
                    <span style={{
                      fontSize: '0.6875rem', padding: '0.125rem 0.5rem',
                      background: 'rgba(245,158,11,0.1)', color: '#fbbf24',
                      borderRadius: '999px', border: '1px solid rgba(245,158,11,0.25)'
                    }}>
                      ⚠ Alacsony relevancia
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start', color: '#666', fontSize: '0.875rem', padding: '0.5rem' }}>
              ⏳ Keresés...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.07)', padding: '0.875rem 1.25rem',
          display: 'flex', gap: '0.75rem'
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Kérdezz a dokumentumokból... (Enter = küld)"
            style={{
              flex: 1, padding: '0.625rem 0.875rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px', fontSize: '0.875rem',
              color: '#e2e8f0', outline: 'none'
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              padding: '0.625rem 1.125rem',
              background: loading || !input.trim() ? 'rgba(255,255,255,0.08)' : '#1a56db',
              color: loading || !input.trim() ? '#555' : 'white',
              border: 'none', borderRadius: '8px',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem', fontWeight: 500, flexShrink: 0
            }}
          >
            Küld
          </button>
        </div>
      </div>
    </div>
  );
}
