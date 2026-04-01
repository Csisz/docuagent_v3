import { useAuth } from '../context/AuthContext';
import LoginPage from '../pages/LoginPage';

export default function ProtectedRoute({ children, requiredRole = null }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p>Betöltés...</p>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
    return <div style={{ padding: '2rem' }}>Nincs jogosultságod ehhez az oldalhoz.</div>;
  }

  return children;
}
