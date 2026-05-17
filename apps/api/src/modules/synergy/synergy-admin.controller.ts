import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { SynergyResolverService } from './synergy-resolver.service';
import { SynergyEntityDescriptor, SynergyActivityContext } from './synergy.types';

interface PreviewRequestBody {
  rule: {
    id?: string;
    name?: string;
    sourceSelector?: any;
    targetSelector?: any;
    context?: any;
    effects?: any[];
    priority?: number;
    stackGroup?: string;
    stackMode?: string;
    maxApplications?: number;
  };
  activityContext: SynergyActivityContext;
  sourceDescriptors: SynergyEntityDescriptor[];
  targetDescriptors: SynergyEntityDescriptor[];
}

@Controller('admin/synergy')
@UseGuards(AdminGuard)
export class SynergyAdminController {
  constructor(private readonly resolver: SynergyResolverService) {}

  /**
   * Dry-run a draft SynergyRule against supplied descriptors and context.
   * Nothing is persisted — this is purely an evaluation preview used by the
   * admin smart editor "Test Rule" action.
   */
  @Post('preview')
  preview(@Body() body: PreviewRequestBody) {
    return this.resolver.previewRule(
      body.rule ?? {},
      body.activityContext ?? { activityType: 'mission' },
      body.sourceDescriptors ?? [],
      body.targetDescriptors ?? [],
    );
  }
}
