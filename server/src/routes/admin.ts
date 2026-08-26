export default [
  { method: 'GET', path: '/health', handler: 'health.check', config: { policies: [] } },

  // Permissions arrive with the RBAC slice; the `admin` route type already requires an
  // authenticated admin user until then.
  { method: 'GET', path: '/providers/catalog', handler: 'provider.catalog', config: { policies: [] } },
  { method: 'GET', path: '/providers', handler: 'provider.find', config: { policies: [] } },
  { method: 'POST', path: '/providers', handler: 'provider.create', config: { policies: [] } },
  { method: 'PUT', path: '/providers/:id', handler: 'provider.update', config: { policies: [] } },
  { method: 'DELETE', path: '/providers/:id', handler: 'provider.delete', config: { policies: [] } },
  { method: 'POST', path: '/providers/:id/test', handler: 'provider.test', config: { policies: [] } },
];
