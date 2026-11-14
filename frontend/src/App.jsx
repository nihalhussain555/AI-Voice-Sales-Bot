import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/ui/toast.jsx';
import { ThemeProvider } from './context/theme.jsx';
import { AuthProvider } from './context/auth.jsx';
import { RequireAuth, RedirectIfAuthed } from './components/auth/Guards.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/auth/ResetPasswordPage.jsx';
import AppShell from './components/AppShell.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import AgentPage from './pages/AgentPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import CustomersPage from './pages/CustomersPage.jsx';
import ImportPage from './pages/ImportPage.jsx';
import AISettingsPage from './pages/AISettingsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import HelpPage from './pages/HelpPage.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15000 }
  }
});

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
              <Routes>
                {/* Signed-out. /reset-password is deliberately open: it is reached
                    from an email link, and the server decides whether the token is
                    worth anything. */}
                <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
                <Route path="/register" element={<RedirectIfAuthed><RegisterPage /></RedirectIfAuthed>} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />

                <Route path="/" element={<RequireAuth><AppShell /></RequireAuth>}>
                  <Route index element={<Navigate to="/overview" replace />} />
                  <Route path="overview" element={<OverviewPage />} />
                  <Route path="agent" element={<AgentPage />} />
                  {/* Pre-redesign URLs kept alive so bookmarks and old links land somewhere sensible. */}
                  <Route path="call" element={<Navigate to="/agent" replace />} />
                  <Route path="phone" element={<Navigate to="/agent?mode=live" replace />} />
                  <Route path="customers" element={<CustomersPage />} />
                  <Route path="import" element={<ImportPage />} />
                  <Route path="leads" element={<Navigate to="/customers" replace />} />
                  <Route path="history" element={<HistoryPage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="ai-settings" element={<AISettingsPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="help" element={<HelpPage />} />
                  {/* The pre-redesign settings page split into provider facts and
                      account settings; old links land on the latter. */}
                  <Route path="settings" element={<Navigate to="/profile" replace />} />
                  <Route path="*" element={<Navigate to="/overview" replace />} />
                </Route>
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
