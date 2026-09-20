import { CommandCenterPage } from './command-center/CommandCenterPage.jsx';
import { CommandCenterProvider } from './command-center/CommandCenterProvider.jsx';
import { AnalyticsPage } from './analytics/AnalyticsPage.jsx';
import { CitizenReportPage } from './report/CitizenReportPage.jsx';

function App() {
  if (window.location.pathname === '/analytics') return <AnalyticsPage />;
  if (window.location.pathname === '/report') return <CitizenReportPage />;
  return (
    <CommandCenterProvider><CommandCenterPage /></CommandCenterProvider>
  );
}

export default App;
