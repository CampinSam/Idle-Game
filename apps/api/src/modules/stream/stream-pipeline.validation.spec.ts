import { assertStreamEvent } from '@derp/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StreamController } from './stream.controller';

const pipelineFixture = JSON.parse(readFileSync(
  resolve(__dirname, '../../../../../packages/shared/test-fixtures/command-pipeline.json'),
  'utf8',
));

describe('stream pipeline runtime validation', () => {
  it('emits the shared hello and tick SSE fixtures that pass the shared validator', () => {
    const response = { write: jest.fn() };
    const controller = new StreamController({} as any, {} as any, {} as any, {} as any);

    for (const { event, data } of pipelineFixture.streamEvents) {
      expect(() => assertStreamEvent(event, data)).not.toThrow();
      (controller as any).sendEvent(response, event, data);
      expect(response.write).toHaveBeenCalledWith(`event: ${event}\n`);
      expect(response.write).toHaveBeenCalledWith(`data: ${JSON.stringify(data)}\n\n`);
    }

  });

  it('refuses malformed SSE data before writing any bytes', () => {
    const response = { write: jest.fn() };
    const controller = new StreamController({} as any, {} as any, {} as any, {} as any);
    const logger = jest.spyOn((controller as any).logger, 'error').mockImplementation();

    (controller as any).sendEvent(response, 'ping', { time: 'invalid' });

    expect(response.write).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('Refusing to emit invalid or unserializable SSE event'));
    logger.mockRestore();
  });
});