import { Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { TelemetryContextBuilderService } from './telemetry-context-builder.service';

@Module({
  providers: [TelemetryService, TelemetryContextBuilderService],
  exports: [TelemetryService, TelemetryContextBuilderService],
})
export class TelemetryModule {}
