import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import Schedule from './pages/Schedule/Schedule';
import Log from './pages/Log/Log';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="log" element={<Log />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
