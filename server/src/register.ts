import type { Core } from '@strapi/strapi';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  // Plugin-owned database models are registered here in a later slice.
  void strapi;
};

export default register;
