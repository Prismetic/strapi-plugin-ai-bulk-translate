import crypto from './crypto';
import jobRunner from './job-runner';
import jobStore from './job-store';
import localeStatus from './locale-status';
import modelStore from './model-store';
import providerRegistry from './provider-registry';
import providerStore from './provider-store';
import translator from './translator';

export default {
  crypto,
  'provider-store': providerStore,
  'provider-registry': providerRegistry,
  'model-store': modelStore,
  'job-store': jobStore,
  'locale-status': localeStatus,
  'job-runner': jobRunner,
  translator,
};
