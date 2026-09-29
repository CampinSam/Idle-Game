import { InternalServerErrorException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertBootstrapResponse, assertDeltaResponse } from '@derp/shared';
import { QueryController } from './query.controller';

const pipelineFixture = JSON.parse(readFileSync(
  resolve(__dirname, '../../../../../packages/shared/test-fixtures/command-pipeline.json'),
  'utf8',
));

describe('query pipeline runtime validation', () => {
  it('emits the shared bootstrap fixture and delta accepted by the shared validators', async () => {
    const controller = new QueryController({
      bootstrap: jest.fn().mockResolvedValue(pipelineFixture.bootstrap),
      getDelta: jest.fn().mockResolvedValue(pipelineFixture.delta),
    } as any);

    const result = await controller.bootstrap({ user: { id: 'user-1' } });
    expect(result).toEqual(pipelineFixture.bootstrap);
    expect(() => assertBootstrapResponse(result)).not.toThrow();

    const delta = await controller.getDelta({ user: { id: 'user-1' } }, '42');
    expect(delta).toEqual(pipelineFixture.delta);
    expect(() => assertDeltaResponse(delta)).not.toThrow();
  });

  it('rejects malformed bootstrap and delta payloads as server errors', async () => {
    const invalidBootstrap = new QueryController({
      bootstrap: jest.fn().mockResolvedValue({
        serverTime: 1,
        snapshot: { player: null, state: {} },
        cursor: { delta: 'not-a-cursor' },
      }),
    } as any);
    await expect(invalidBootstrap.bootstrap({ user: { id: 'user-1' } }))
      .rejects.toThrow(InternalServerErrorException);

    const invalidDelta = new QueryController({
      getDelta: jest.fn().mockResolvedValue({
        from: '0',
        to: '1',
        patches: [{ op: 'upsert', entity: 'unsupported', id: 'x', data: {} }],
        ui: [],
      }),
    } as any);
    await expect(invalidDelta.getDelta({ user: { id: 'user-1' } }, '0'))
      .rejects.toThrow(InternalServerErrorException);
  });
});