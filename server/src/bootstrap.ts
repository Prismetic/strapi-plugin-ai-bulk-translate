import type { Core } from '@strapi/strapi';

const bootstrap = ({ strapi }: { strapi: Core.Strapi }) => {
  // RBAC actions are registered here in a later slice.
  void strapi;
};

export default bootstrap;
