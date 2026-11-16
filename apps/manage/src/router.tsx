import { createBrowserRouter } from 'react-router';
import { Layout, RequireAuth } from './components/Layout.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { OrgPage } from './pages/OrgPage.tsx';
import { EditorPage } from './pages/EditorPage.tsx';
import { CodesPage } from './pages/CodesPage.tsx';
import { IssuePage } from './pages/IssuePage.tsx';
import { CheckoutPage } from './pages/CheckoutPage.tsx';
import { PrintPage } from './pages/PrintPage.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { ApiKeysPage } from './pages/ApiKeysPage.tsx';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/orgs/:orgId', element: <OrgPage /> },
          { path: '/orgs/:orgId/achievements/new', element: <EditorPage /> },
          { path: '/orgs/:orgId/achievements/:id', element: <EditorPage /> },
          { path: '/orgs/:orgId/achievements/:id/codes', element: <CodesPage /> },
          { path: '/orgs/:orgId/achievements/:id/print', element: <PrintPage /> },
          { path: '/orgs/:orgId/api-keys', element: <ApiKeysPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
      // Vollbild ohne Navigation: Ausgabe-Modus und Kasse
      { path: '/orgs/:orgId/codes/:codeId/issue', element: <IssuePage /> },
      { path: '/orgs/:orgId/codes/:codeId/checkout', element: <CheckoutPage /> },
    ],
  },
]);
