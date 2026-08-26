import contentType from './content-type.controller';
import health from './health.controller';
import job from './job.controller';
import locale from './locale.controller';
import model from './model.controller';
import provider from './provider.controller';

export default {
  health,
  provider,
  model,
  job,
  locale,
  'content-type': contentType,
};
