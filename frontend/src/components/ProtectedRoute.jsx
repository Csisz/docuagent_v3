import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoginPage from '../pages/LoginPage';

export default function ProtectedRoute({ children, requiredRole = null }) {
  const { user, loading, onboardingDone, onboardingChecked } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  useEffect(() => {
    if (!loading && user && onboardingChecked && !onboardingDone && location.pathname !== '/onboarding') {
      navigate('/onboarding', { replace: true });
    }
  }, [loading, user, onboardingDone, onboardingChecked, location.pathname, navigate]);

  if (loading || (user && !onboardingChecked)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#050d18', color: '#64748b', fontSize: 14 }}>
        Betöltés...
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
    return <div style={{ padding: '2rem', color: '#e2e8f0' }}>Nincs jogosultságod ehhez az oldalhoz.</div>;
  }

  return children;
}
