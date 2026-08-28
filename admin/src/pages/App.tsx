import { Main } from '@strapi/design-system';
import { Page } from '@strapi/strapi/admin';
import { Route, Routes } from 'react-router-dom';

import { PluginHeader } from '../components/PluginHeader';
import { HomePage } from './HomePage';
import { JobsPage } from './JobsPage';

/**
 * The plugin's own routes, under one menu entry.
 *
 * The header and its tabs live here rather than in either page, so both are framed identically and
 * neither can drift. Each tab is a real route: linkable, reloadable, and back-button-shaped.
 */
const App = () => (
  <Main>
    <PluginHeader />
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="jobs" element={<JobsPage />} />
      <Route path="*" element={<Page.Error />} />
    </Routes>
  </Main>
);

export { App };
