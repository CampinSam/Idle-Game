import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EffectService } from './effect.service';

@Controller('effects')
@UseGuards(AuthGuard('jwt'))
export class EffectController {
  constructor(private effectService: EffectService) {}

  @Get('defs')
  async listDefs() {
    const map = await this.effectService.getEffectDefs();
    return Array.from(map.values()).map((d: any) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      iconKey: d.iconKey,
      category: d.category,
      valueMode: d.valueMode,
      durationModel: d.durationModel,
      stackingRule: d.stackingRule,
      targetType: d.targetType,
      value: d.value,
      stats: d.stats,
      trait: d.trait,
      durationSec: d.durationSec,
      durationTicks: d.durationTicks,
      maxStacks: d.maxStacks,
      maxUses: d.maxUses,
      cap: d.cap,
      resourceId: d.resourceId,
      sessionType: d.sessionType,
    }));
  }
}
