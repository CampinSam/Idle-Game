import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, CommandContext, CommandHandlerResult } from '../command.types';
import { PatchBuilder, buildLocationPatches } from '../patch-builder';
import { LocationService } from '../../location/location.service';
import { ANTI_WHALE_CAPS } from '@derp/shared';
import type { ModalSpecV1, ModalBlock, ModalButton } from '@derp/shared';

function makeConsequencesBlock(): ModalBlock {
  return {
    type: 'richText',
    doc: [
      {
        t: 'ul',
        c: [
          { t: 'li', c: [{ t: 'text', v: 'All available resources are collected' }] },
          { t: 'li', c: [{ t: 'text', v: 'All assigned workers are freed' }] },
          { t: 'li', c: [{ t: 'text', v: 'All active jobs are cancelled' }] },
        ],
      },
    ],
  };
}

function buildSwapButton(
  activeId: string,
  enableLocationId: string,
  label: string,
): ModalButton {
  return {
    id: `swap-${activeId}`,
    label,
    variant: 'danger',
    action: {
      type: 'EXECUTE_COMMAND',
      command: 'SwapOutpost',
      payload: { disableLocationId: activeId, enableLocationId },
    },
  };
}

@Injectable()
export class ToggleLocationHandler implements CommandHandler {
  constructor(private locationService: LocationService) {}

  async execute(ctx: CommandContext, payload: any): Promise<CommandHandlerResult> {
    const { locationId, enabled } = payload;

    if (enabled) {
      const user = await (ctx.tx as any).user.findUnique({
        where: { id: ctx.userId },
        select: { keeperLevel: true, bonusOutpostSlots: true },
      });
      if (!user) throw new NotFoundException('User not found');

      const activeCount = await (ctx.tx as any).locationInstance.count({
        where: { ownerUserId: ctx.userId, enabled: true },
      });

      const maxOutposts = ANTI_WHALE_CAPS.maxActiveOutposts(user.keeperLevel, user.bonusOutpostSlots ?? 0);

      if (activeCount >= maxOutposts) {
        const activeLocations = await (ctx.tx as any).locationInstance.findMany({
          where: { ownerUserId: ctx.userId, enabled: true },
          select: { id: true, name: true },
          orderBy: { createdAt: 'asc' },
        });

        const locationStats = await Promise.all(
          activeLocations.map(async (loc: any) => {
            const [workerCount, buildingJobCount, craftingJobCount] = await Promise.all([
              (ctx.tx as any).locationWorkerAssignment.count({ where: { locationId: loc.id } }),
              (ctx.tx as any).job.count({
                where: {
                  userId: ctx.userId,
                  type: 'BuildingJob',
                  status: { in: ['active', 'ready_notified'] },
                  data: { path: ['locationId'], equals: loc.id },
                },
              }),
              (ctx.tx as any).job.count({
                where: {
                  userId: ctx.userId,
                  type: 'CraftingJob',
                  status: { in: ['active', 'ready_notified'] },
                  data: { path: ['locationId'], equals: loc.id },
                },
              }),
            ]);
            return { ...loc, workerCount, activeJobs: buildingJobCount + craftingJobCount };
          }),
        );

        let pageBody: ModalBlock[];
        let pageButtons: ModalButton[];

        if (maxOutposts === 1) {
          const active = locationStats[0];
          const activeName = active.name || 'Outpost';
          pageBody = [
            {
              type: 'richText',
              doc: [
                { t: 'p', c: [{ t: 'strong', c: [{ t: 'text', v: `Deactivating ${activeName} will immediately:` }] }] },
              ],
            },
            makeConsequencesBlock(),
          ];
          pageButtons = [buildSwapButton(active.id, locationId, `Deactivate ${activeName} & Activate`)];
        } else {
          pageBody = [
            {
              type: 'richText',
              doc: [
                {
                  t: 'p',
                  c: [{ t: 'text', v: 'You have reached your outpost limit. Choose which outpost to deactivate:' }],
                },
              ],
            },
            {
              type: 'metaRows',
              rows: locationStats.map((loc: any) => ({
                label: loc.name || 'Outpost',
                value: `${loc.workerCount} worker${loc.workerCount !== 1 ? 's' : ''} · ${loc.activeJobs} active job${loc.activeJobs !== 1 ? 's' : ''}`,
              })),
            },
          ];
          pageButtons = locationStats.map((loc: any) =>
            buildSwapButton(loc.id, locationId, `Deactivate ${loc.name || 'Outpost'}`),
          );
        }

        const spec: ModalSpecV1 = {
          version: 1,
          id: `outpost-swap-${locationId}`,
          kind: 'outpost_swap',
          dismiss: { backdrop: true, x: true, escape: true },
          header: {
            title: 'Outpost Limit Reached',
            subtitle: 'You must deactivate an outpost to activate this one.',
          },
          buttons: [],
          pages: [{ body: pageBody, buttons: pageButtons }],
        };

        return {
          patches: [],
          ui: [{ type: 'modal', spec }],
        };
      }
    }

    await this.locationService.toggleLocationEnabled(ctx.userId, locationId, enabled, ctx.tx);

    const pb = new PatchBuilder();
    await buildLocationPatches(pb, ctx.tx, ctx.userId, locationId);

    return {
      patches: pb.build(),
      ui: [],
    };
  }
}
