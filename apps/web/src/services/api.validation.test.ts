import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertBootstrapResponse, assertCommandResponse, assertDeltaResponse } from '@derp/shared';
import { api } from './api';
import pipelineFixture from '../../../../packages/shared/test-fixtures/command-pipeline.json';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClient command-pipeline validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('consumes the shared bootstrap fixture and rejects incompatible bootstrap data', async () => {
    assertBootstrapResponse(pipelineFixture.bootstrap);
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(pipelineFixture.bootstrap));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.bootstrap()).resolves.toEqual(pipelineFixture.bootstrap);

    fetchMock.mockResolvedValueOnce(jsonResponse({
      ...pipelineFixture.bootstrap,
      cursor: { delta: 12 },
    }));
    await expect(api.bootstrap()).rejects.toThrow('bootstrap.cursor.delta');
  });

  it('validates command requests before fetch and command responses after fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(pipelineFixture.command));
    vi.stubGlobal('fetch', fetchMock);
    const request = { type: 'inventory.refresh', payload: {}, idempotencyKey: 'fixture-key' };

    assertCommandResponse(pipelineFixture.command);
    await expect(api.sendCommand(request)).resolves.toEqual(pipelineFixture.command);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(() => api.sendCommand({
      type: 'inventory.refresh',
      payload: { unsupported: Number.NaN },
      idempotencyKey: 'bad-key',
    })).toThrow('commandRequest.payload.unsupported');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(jsonResponse({
      ...pipelineFixture.command,
      patches: [{ op: 'upsert', entity: 'not-a-patch-entity', id: 'x', data: {} }],
    }));
    await expect(api.sendCommand(request)).rejects.toThrow('commandResponse.patches[0].entity');
  });

  it('distinguishes and validates delta results and reset responses', async () => {
    assertDeltaResponse(pipelineFixture.delta);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(pipelineFixture.delta))
      .mockResolvedValueOnce(jsonResponse({ resetRequired: true, reason: 'cursor expired' }))
      .mockResolvedValueOnce(jsonResponse({ resetRequired: true, reason: 42 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.fetchDelta(pipelineFixture.delta.from)).resolves.toEqual(pipelineFixture.delta);
    await expect(api.fetchDelta('1')).resolves.toEqual({ resetRequired: true, reason: 'cursor expired' });
    await expect(api.fetchDelta('2')).rejects.toThrow('deltaReset.reason');
  });
});