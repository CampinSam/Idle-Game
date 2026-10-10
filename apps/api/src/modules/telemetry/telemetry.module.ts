import { Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { TelemetryContextBuilderService } from './telemetry-context-builder.service';
import { TelemetryDefService } from './telemetry-def.service';
import { TelemetryDefController } from './telemetry-def.controller';
import { SelectionModule } from '../selection/selection.module';

@Module({
  imports: [SelectionModule],
  providers: [TelemetryService, TelemetryContextBuilderService, TelemetryDefService],
  controllers: [TelemetryDefController],
  exports: [TelemetryService, TelemetryContextBuilderService, TelemetryDefService],
})
export class TelemetryModule {}
