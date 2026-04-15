import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('audio')
export class AudioController {
  constructor(private prisma: PrismaService) {}

  @Get('config')
  async getAudioConfig() {
    const [soundDefs, mappings] = await Promise.all([
      this.prisma.soundDef.findMany({
        where: { enabled: true },
        select: { id: true, key: true, name: true, fileKey: true, bus: true },
      }),
      this.prisma.soundMapping.findMany({
        where: { enabled: true },
        select: { actionKey: true, soundDefId: true, weight: true },
      }),
    ]);

    const soundMap: Record<string, { id: string; key: string; name: string; fileKey: string | null; bus: string }> = {};
    for (const s of soundDefs) {
      soundMap[s.id] = s;
    }

    const actionMap: Record<string, Array<{ soundKey: string; fileKey: string | null; weight: number }>> = {};
    for (const m of mappings) {
      const sound = soundMap[m.soundDefId];
      if (!sound) continue;
      if (!actionMap[m.actionKey]) actionMap[m.actionKey] = [];
      actionMap[m.actionKey].push({ soundKey: sound.key, fileKey: sound.fileKey, weight: m.weight });
    }

    return { actionMap };
  }
}
