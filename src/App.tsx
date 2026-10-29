import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import Login, { PendingApproval } from './pages/Login';
import EntityListPage from './pages/EntityListPage';
import RecordPage from './pages/RecordPage';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const BoardPack = lazy(() => import('./pages/BoardPack'));
const ExcelImport = lazy(() => import('./pages/ExcelImport'));
const Reports = {
  Alerts: lazy(() => import('./pages/Reports').then((m) => ({ default: m.AlertsPage }))),
  Bank: lazy(() => import('./pages/Reports').then((m) => ({ default: m.BankUtilizationPage }))),
  Docs: lazy(() => import('./pages/Reports').then((m) => ({ default: m.DocumentsPage }))),
};
const Phase3 = {
  Bond: lazy(() => import('./pages/Phase3').then((m) => ({ default: m.BondStatementPage }))),
  Incentive: lazy(() => import('./pages/Phase3').then((m) => ({ default: m.IncentivePage }))),
};
const Admin = {
  Users: lazy(() => import('./pages/Admin').then((m) => ({ default: m.UsersPage }))),
  Perms: lazy(() => import('./pages/Admin').then((m) => ({ default: m.PermissionsPage }))),
  Settings: lazy(() => import('./pages/Admin').then((m) => ({ default: m.SettingsPage }))),
  Audit: lazy(() => import('./pages/Admin').then((m) => ({ default: m.AuditLogPage }))),
};

export default function App() {
  const { session, profile, role, loading, isGM, signOut } = useAuth();
  if (loading) return <Spinner />;
  if (!session) return <Login />;
  if (!role) return <PendingApproval email={profile?.email ?? session.user.email ?? ''} onSignOut={signOut} />;
  const gmOnly = (el: JSX.Element) => (isGM ? el : <Navigate to="/" replace />);
  return (
    <Layout>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={role === 'store' ? <Navigate to="/m/goods_receipts" replace /> : <Dashboard />} />
          <Route path="/alerts" element={<Reports.Alerts />} />
          <Route path="/m/:key" element={<EntityListPage />} />
          <Route path="/r/:key/:id" element={<RecordPage />} />
          <Route path="/bond" element={<Phase3.Bond />} />
          <Route path="/incentive" element={<Phase3.Incentive />} />
          <Route path="/bank-utilization" element={<Reports.Bank />} />
          <Route path="/board-pack" element={<BoardPack />} />
          <Route path="/documents" element={<Reports.Docs />} />
          <Route path="/import" element={<ExcelImport />} />
          <Route path="/admin/users" element={gmOnly(<Admin.Users />)} />
          <Route path="/admin/permissions" element={gmOnly(<Admin.Perms />)} />
          <Route path="/admin/settings" element={gmOnly(<Admin.Settings />)} />
          <Route path="/admin/audit" element={role === 'gm_commercial' || role === 'management' ? <Admin.Audit /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
