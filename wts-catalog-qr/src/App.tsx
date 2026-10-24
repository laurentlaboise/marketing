import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CartPage } from './pages/CartPage';
import { HelpPage } from './pages/HelpPage';
import { HomePage } from './pages/HomePage';
import { PrintQrsPage } from './pages/PrintQrsPage';
import { ProductPage } from './pages/ProductPage';
import { WizardPage } from './pages/WizardPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/q/:slug" element={<ProductPage />} />
        <Route path="/wizard" element={<WizardPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/print-qrs" element={<PrintQrsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
