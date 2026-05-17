import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { SynergyResolverService } from './synergy-resolver.service';
import { SynergyEntityDescriptor, SynergyActivityContext } from './synergy.types';

interface PreviewRequestBody {
  entityDescriptors: SynergyEntityDescriptor[];
  activityContext: SynergyActivityContext;
}

@Controller('admin/synergy')
@UseGuards(AdminGuard)
export class SynergyAdminController {
  constructor(private readonly resolver: SynergyResolverService) {}

  /**
   * Run all enabled SynergyRules against the supplied entity descriptors and
   * activity context. Returns the full resolver output so admins can see which
   * rules fire and what the combined effect totals are.
   *
   * Typical workflow: enable a rule in the smart editor, call this endpoint
   * with a representative team, confirm the output, then keep or disable the rule.
   */
  @Post('preview')
  preview(@Body() body: PreviewRequestBody) {
    const descriptors = body.entityDescriptors ?? [];
    const context = body.activityContext ?? { activityType: 'mission' };
    return this.resolver.resolveRules(context, descriptors, descriptors);
  }
}
