import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { useAuth } from '../../context/auth.jsx';
import { BrandMark } from '../ui/brand.jsx';

// While the bootstrap probe is in flight the app knows nothing. Rendering the
// console anyway would fire a dozen unauthenticated requests and bounce a
// perfectly valid session to the login page, so this state gets its own screen.
function Splash({ label }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas-deep text-ink">
      <BrandMark size="lg" />
      <p className="inline-flex items-center gap-2 text-[12px] font-semibold text-ink-muted">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        {label}
      </p>
    </div>
  );
}

// Wraps the signed-in console. `next` carries the intended destination so the
// login page can return the user there after they sign in.
export function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Splash label="Checking your session" />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ next: location.pathname + location.search }} />;
  }
  return children;
}

// The inverse, for /login and /register: an already-signed-in browser should not
// be able to sit on a sign-in form and end up with two accounts in one session.
export function RedirectIfAuthed({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <Splash label="Checking your session" />;
  if (status === 'authenticated') return <Navigate to="/overview" replace />;
  return children;
}
