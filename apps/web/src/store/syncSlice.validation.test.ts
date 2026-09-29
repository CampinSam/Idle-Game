import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import syncReducer, { applyPatches, setSnapshot } from './syncSlice';
import pipelineFixture from '../../../../packages/shared/test-fixtures/command-pipeline.json';

describe('sync patch boundary validation', () => {
  it('hydrates and applies the shared command and delta wire fixtures', () => {
    const store = configureStore({ reducer: syncReducer });
    store.dispatch(setSnapshot(pipelineFixture.bootstrap as any));

    expect(store.getState().tickAnchor?.currentTick).toBe(8400);
    expect(store.getState().entities['entity-1'].name).toBe('Ember');
    expect(store.getState().items['item-instance-1'].quantity).toBe(3);
    expect(store.getState().jobs['job-1'].status).toBe('active');
    expect(store.getState().notifications['notification-1'].title).toBe('Crafting started');
    expect(store.getState().currencyBalances).toEqual({ soft_arcanium: 245, hard_essence: '18' });
    expect(store.getState().homeBanners[0].id).toBe('banner-autumn');
    expect(store.getState().entityPowerUsages['entity-1']['quick-heal'].chargeUnits).toBe(2);
    expect(store.getState().locationPowerUsages['location-1']['resource-surge'].grantId).toBe('power-grant-2');

    store.dispatch(applyPatches({
      patches: pipelineFixture.command.patches as any,
      cursor: pipelineFixture.command.cursor.delta,
    }));
    expect(store.getState().items['item-instance-1'].quantity).toBe(4);
    expect(store.getState().player?.username).toBe('Aster');
    expect(store.getState().player?.keeperXp).toBe('1300');
    expect(store.getState().currencyBalances.soft_arcanium).toBe(260);
    expect(store.getState().cursor).toBe(pipelineFixture.command.cursor.delta);

    store.dispatch(applyPatches({
      patches: pipelineFixture.delta.patches as any,
      cursor: pipelineFixture.delta.to,
    }));
    expect(store.getState().items['item-instance-1'].quantity).toBe(4);
    expect(store.getState().cursor).toBe(pipelineFixture.delta.to);
  });

  it('rejects the whole batch before applying patches or advancing the cursor', () => {
    const store = configureStore({ reducer: syncReducer });
    store.dispatch(applyPatches({
      patches: [],
      cursor: 'cursor-4',
    }));
    const before = store.getState();

    expect(() => store.dispatch(applyPatches({
      patches: [
        { op: 'upsert', entity: 'item', id: 'item-1', data: { id: 'item-1' } },
        { op: 'upsert', entity: 'unknown-entity', id: 'bad', data: {} },
      ] as any,
      cursor: 'cursor-5',
    }))).toThrow('patches[1].entity');

    expect(store.getState()).toBe(before);
    expect(store.getState().cursor).toBe('cursor-4');
    expect(store.getState().items).toEqual({});
  });

  it('intentionally ignores known definition patches without losing later cursor progress', () => {
    const store = configureStore({ reducer: syncReducer });
    store.dispatch(applyPatches({
      patches: [
        { op: 'upsert', entity: 'categoryDef', id: 'category-1', data: { id: 'category-1' } },
        { op: 'upsert', entity: 'missionDef', id: 'mission-1', data: { id: 'mission-1' } },
      ],
      cursor: 'cursor-1',
    }));

    expect(store.getState().cursor).toBe('cursor-1');
    expect(store.getState().entities).toEqual({});
    expect(store.getState().missions).toEqual({});
  });
});