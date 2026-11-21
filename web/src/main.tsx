// The top bar with links to Runs and Settings, and the route for each page.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import RunsPage from './runs/RunsPage';
import RunPage from './run/RunPage';
import ComparePage from './compare/ComparePage';
import RecordPage from './record/RecordPage';
import SettingsPage from './settings/SettingsPage';

const topBarStyle: React.CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '12px 24px',
  display: 'flex',
  gap: 24,
  alignItems: 'center',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
        <div style={topBarStyle}>
          <strong>Remit Eval</strong>
          <Link to="/">Runs</Link>
          <Link to="/settings">Settings</Link>
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>{children}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<RunsPage />} />
          <Route path="/runs/:id" element={<RunPage />} />
          <Route path="/runs/:id/records/:recordId" element={<RecordPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  </React.StrictMode>,
);
