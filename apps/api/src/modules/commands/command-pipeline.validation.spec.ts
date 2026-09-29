import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertCommandRequest, assertCommandResponse, assertPatch } from '@derp/shared';
import { CommandService } from './command.service';
import { PatchBuilder } from './patch-builder';

const pipelineFixture = JSON.parse(readFileSync(
  resolve(__dirname, '../../../../../packages/shared/test-fixtures/command-pipeline.json'),
  'utf8',
));

describe('command pipeline runtime validation', () => {
  it('accepts representative PatchBuilder output with the shared patch validator', () => {
    const patches = new PatchBuilder()
      .upsert('item', 'item-1', { id: 'item-1', quantity: 2 })
      .delete('job', 'job-1')
      .build();

    expect(() => patches.forEach((patch) => assertPatch(patch))).not.toThrow();
  });

  it('rejects an invalid individual PatchBuilder patch', () => {
    expect(() => new PatchBuilder().upsert('not-an-entity', 'x', {}).build())
      .toThrow(InternalServerErrorException);
  });

  it('emits the shared command fixture and validates handler output before writing a delta', async () => {
    const validHandler = {
      execute: jest.fn().mockResolvedValue({
        patches: pipelineFixture.command.patches,
        ui: pipelineFixture.command.ui,
      }),
    };
    const tx = { playerDelta: { create: jest.fn().mockResolvedValue({ id: BigInt(pipelineFixture.command.cursor.delta) }) } };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const idempotency = {
      hashRequest: jest.fn().mockReturnValue('hash'),
      checkExisting: jest.fn().mockResolvedValue(null),
      store: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CommandService(
      prisma as any,
      { resolve: jest.fn().mockReturnValue(validHandler) } as any,
      idempotency as any,
      { executeWithLock: jest.fn((_userId, _tx, callback) => callback(tx)) } as any,
      { publish: jest.fn() } as any,
    );

    const validRequest = {
      type: 'inventory.refresh',
      payload: {},
      idempotencyKey: 'request-1',
    };
    expect(() => assertCommandRequest(validRequest)).not.toThrow();
    await expect(service.execute('user-1', {
      ...validRequest,
      payload: [] as any,
    })).rejects.toThrow(BadRequestException);

    const response = await service.execute('user-1', {
      type: 'inventory.refresh',
      payload: {},
      idempotencyKey: 'request-1',
    });
    expect(() => assertCommandResponse(response)).not.toThrow();
    expect(response).toEqual(pipelineFixture.command);
    expect(response.cursor.delta).toBe(pipelineFixture.command.cursor.delta);
    expect(tx.playerDelta.create).toHaveBeenCalledTimes(1);

    const invalidHandler = {
      execute: jest.fn().mockResolvedValue({ patches: [{ malformed: true }], ui: [] }),
    };
    const invalidTx = { playerDelta: { create: jest.fn() } };
    const invalidService = new CommandService(
      { $transaction: jest.fn((callback) => callback(invalidTx)) } as any,
      { resolve: jest.fn().mockReturnValue(invalidHandler) } as any,
      idempotency as any,
      { executeWithLock: jest.fn((_userId, _tx, callback) => callback(invalidTx)) } as any,
      { publish: jest.fn() } as any,
    );
    await expect(invalidService.execute('user-1', {
      type: 'inventory.refresh',
      payload: {},
      idempotencyKey: 'request-2',
    })).rejects.toThrow(InternalServerErrorException);
    expect(invalidTx.playerDelta.create).not.toHaveBeenCalled();

    const replayService = new CommandService(
      { $transaction: jest.fn((callback) => callback(tx)) } as any,
      { resolve: jest.fn() } as any,
      {
        ...idempotency,
        checkExisting: jest.fn().mockResolvedValue({ responseJson: { patches: [], ui: [] } }),
      } as any,
      {} as any,
      { publish: jest.fn() } as any,
    );
    await expect(replayService.execute('user-1', {
      type: 'inventory.refresh',
      payload: {},
      idempotencyKey: 'request-1',
    })).rejects.toThrow(InternalServerErrorException);
  });
});