export default [
  {
    method: 'GET',
    path: '/health',
    handler: 'health.check',
    config: {
      // Permissions arrive with the RBAC slice. Until then this is admin-authenticated
      // only, which the `admin` route type already enforces.
      policies: [],
    },
  },
];
