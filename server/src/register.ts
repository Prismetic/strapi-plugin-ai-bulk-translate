import { models } from './models';

import type { Core } from '@strapi/strapi';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  // Raw database models, so plugin tables stay out of the Content Manager.
  for (const model of models) {
    strapi.get('models').add(model);
  }
};

export default register;
