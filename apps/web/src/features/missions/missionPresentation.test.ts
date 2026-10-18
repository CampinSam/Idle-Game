import { expect, it } from 'vitest';
import { assertMissionPresentation } from '@derp/shared';
it('preserves absent presentation and accepts only the pilot vocabulary', () => {
  expect(() => assertMissionPresentation(undefined)).not.toThrow();
  expect(() => assertMissionPresentation({ version: 1, spacing: 'compact', variant: 'panel' })).not.toThrow();
  for (const value of [null, [], { version: 2 }, { version: 1, css: 'overflow:auto' }, { version: 1, spacing: 'huge' }, { version: 1, variant: 'script' }]) {
    expect(() => assertMissionPresentation(value)).toThrow();
  }
});
