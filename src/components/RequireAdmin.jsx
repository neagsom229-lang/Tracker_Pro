import { Navigate } from 'react-router-dom';
import { useStore } from '../store/useStore';

export default function RequireAdmin({ children }) {
  const profile = useStore((s) => s.profile);
  return profile?.isAdmin ? children : <Navigate to="/dashboard" replace />;
}
