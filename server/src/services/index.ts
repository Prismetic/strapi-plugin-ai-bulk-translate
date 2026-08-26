import crypto from './crypto';
import modelStore from './model-store';
import providerRegistry from './provider-registry';
import providerStore from './provider-store';

export default {
  crypto,
  'provider-store': providerStore,
  'provider-registry': providerRegistry,
  'model-store': modelStore,
};
