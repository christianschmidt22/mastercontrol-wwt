import { Routes, Route } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { HomePage } from './pages/HomePage';
import { TasksPage } from './pages/TasksPage';
import { ReportsPage } from './pages/ReportsPage';
import { CustomerPage } from './pages/CustomerPage';
import { OemPage } from './pages/OemPage';
import { AgentsPage } from './pages/AgentsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/customers/:id" element={<CustomerPage />} />
        <Route path="/oem" element={<OemPage />} />
        <Route path="/oem/:id" element={<OemPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}
