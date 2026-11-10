import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/ui/toast.jsx';
import AppShell from './components/AppShell.jsx';
import CallPage from './pages/CallPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import LeadsPage from './pages/LeadsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15000 }
  }
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index element={<Navigate to="/call" replace />} />
              <Route path="call" element={<CallPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="leads" element={<LeadsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/call" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
