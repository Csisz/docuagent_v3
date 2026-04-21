import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks';

export default function ReplyEditor({ email, onSent, onClose }) {
  const { authFetch, user } = useAuth();
  const toast = useToast();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const [replyText, setReplyText]       = useState(email.ai_response || '');
  const [sending, setSending]           = useState(false);
  const [error, setError]               = useState('');
  const [regenerating, setRegenerating] = useState(false);

  async function handleSend() {
    if (!replyText.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await authFetch(`${apiUrl}/api/emails/${email.id}/send-reply`, {
        method: 'POST',
        body: JSON.stringify({ reply: replyText })
      });
      if (!res.ok) throw new Error(await res.text());
      toast('Válasz elküldve', 'ok');
      onSent?.();
    } catch (e) {
      const msg = e.message || 'Küldési hiba';
      setError(msg);
      toast(msg, 'err');
    } finally {
      setSending(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setError('');
    try {
      const res = await authFetch(`${apiUrl}/api/generate-reply`, {
        method: 'POST',
        body: JSON.stringify({
          email_id:  email.id,
          subject:   email.subject,
          body:      email.body,
          category:  email.category,
          tenant_id: user?.tenant_id,
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.reply) throw new Error('Üres válasz érkezett');
      setReplyText(data.reply);
      toast('Válasz újragenerálva', 'ok');
    } catch (e) {
      const msg = e.message || 'Újragenerálás sikertelen';
      setError(msg);
      toast(msg, 'err');
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div style={{
      border: '1px solid #e0e0e0', borderRadius: '12px',
      padding: '1.25rem', background: '#fafafa', marginTop: '1rem'
    }}>
      {/* Email context */}
      <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f0f4ff', borderRadius: '8px' }}>
        <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
          Feladó: <strong style={{ color: '#333' }}>{email.sender}</strong>
        </div>
        <div style={{ fontSize: '0.875rem', color: '#333', maxHeight: '80px', overflow: 'hidden' }}>
          {email.body?.substring(0, 200)}{email.body?.length > 200 ? '…' : ''}
        </div>
      </div>

      {/* Reply textarea */}
      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: '#333' }}>
        Válasz szövege
      </label>
      <textarea
        value={replyText}
        onChange={e => setReplyText(e.target.value)}
        rows={8}
        style={{
          width: '100%', padding: '0.75rem',
          border: '1px solid #e0e0e0', borderRadius: '8px',
          fontSize: '0.875rem', fontFamily: 'inherit',
          resize: 'vertical', boxSizing: 'border-box',
          background: 'white', color: '#1a1a1a'
        }}
      />

      {error && (
        <div style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.5rem' }}>{error}</div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          style={{
            padding: '0.5rem 1rem', border: '1px solid #e0e0e0',
            borderRadius: '8px', background: 'white', cursor: regenerating ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem', color: '#555'
          }}
        >
          {regenerating ? '⏳ Generálás...' : '🔄 Újragenerálás'}
        </button>

        <button
          onClick={onClose}
          style={{
            padding: '0.5rem 1rem', border: '1px solid #e0e0e0',
            borderRadius: '8px', background: 'white', cursor: 'pointer',
            fontSize: '0.875rem', color: '#555'
          }}
        >
          Mégse
        </button>

        <button
          onClick={handleSend}
          disabled={sending || !replyText.trim()}
          style={{
            padding: '0.5rem 1.25rem',
            background: sending ? '#94a3b8' : '#16a34a',
            color: 'white', border: 'none', borderRadius: '8px',
            cursor: sending || !replyText.trim() ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem', fontWeight: 500
          }}
        >
          {sending ? '⏳ Küldés...' : '📤 Jóváhagy & Küld'}
        </button>
      </div>
    </div>
  );
}
