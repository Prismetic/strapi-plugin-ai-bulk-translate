import { describe, expect, it } from 'vitest';

import { ACTIONS } from '../permissions/actions';
import routes from './admin';

/**
 * The failure mode this guards is silent: a route added without a policy is reachable by any
 * authenticated administrator, and nothing about it looks wrong. Nobody notices until someone who
 * should not have been able to spend API credit does.
 */
describe('admin routes', () => {
  const known = new Set<string>(Object.values(ACTIONS));

  it('gates every route — none is left open to any authenticated admin', () => {
    const ungated = routes
      .filter((route) => !(route.config?.policies?.length > 0))
      .map((route) => `${route.method} ${route.path}`);

    expect(ungated).toEqual([]);
  });

  it('names only actions this plugin actually registers', () => {
    for (const route of routes) {
      for (const policy of route.config.policies) {
        for (const action of policy.config.actions) {
          expect(known, `${route.method} ${route.path} names an unknown action`).toContain(action);
        }
      }
    }
  });

  it('never lets a write be reached with a read permission', () => {
    const writes = routes.filter((route) => route.method !== 'GET');

    for (const route of writes) {
      const actions = route.config.policies.flatMap((p: { config: { actions: string[] } }) =>
        p.config.actions
      );

      expect(
        actions.includes(ACTIONS.settingsRead) && !actions.includes(ACTIONS.settingsUpdate),
        `${route.method} ${route.path} is a write reachable with settings.read alone`
      ).toBe(false);
    }
  });

  it('requires settings.update for anything touching credentials', () => {
    const credentialRoutes = routes.filter(
      (route) => route.path.startsWith('/providers') && route.method !== 'GET'
    );

    expect(credentialRoutes.length).toBeGreaterThan(0);

    for (const route of credentialRoutes) {
      const actions = route.config.policies.flatMap((p: { config: { actions: string[] } }) =>
        p.config.actions
      );

      expect(actions, `${route.method} ${route.path}`).toContain(ACTIONS.settingsUpdate);
    }
  });

  it('keeps the run endpoints behind translate', () => {
    for (const path of ['/jobs', '/locale-status']) {
      const route = routes.find((r) => r.path === path && r.method === 'POST');
      const actions = route?.config.policies.flatMap(
        (p: { config: { actions: string[] } }) => p.config.actions
      );

      expect(actions).toContain(ACTIONS.translate);
    }
  });
});
