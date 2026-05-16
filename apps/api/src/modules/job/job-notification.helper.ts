import { JOB_TYPE_CONFIG } from './job.constants';

/**
 * Creates job_ready notifications for a set of jobs belonging to a single user.
 * Used by both JobService.notifyReadyJobs (controller-triggered) and
 * TickEventProcessorService (server-side tick-driven) so notification
 * creation logic stays in one place.
 *
 * @returns Array of created notification records
 */
export async function createJobReadyNotifications(
  prisma: any,
  notificationService: { createNotification: (dto: any) => Promise<any> },
  logger: { warn: (msg: string) => void },
  userId: string,
  jobs: Array<{ id: string; type: string; defId: string }>,
): Promise<any[]> {
  const createdNotifs: any[] = [];

  const byType = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const list = byType.get(job.type) ?? [];
    list.push(job);
    byType.set(job.type, list);
  }

  for (const [type, typeJobs] of byType) {
    const config = JOB_TYPE_CONFIG[type];
    if (!config) continue;

    const defIds = [...new Set(typeJobs.map((j) => j.defId).filter(Boolean))];
    const defs = defIds.length > 0
      ? await prisma[config.defTable].findMany({ where: { id: { in: defIds } } })
      : [];
    const defMap = new Map<string, any>(defs.map((d: any) => [d.id, d]));

    for (const job of typeJobs) {
      try {
        const def = defMap.get(job.defId);
        const defName = def?.name || config.label;
        const notif = await notificationService.createNotification({
          userId,
          type: 'job_ready',
          category: config.category,
          priority: 'high',
          title: `${config.label} Ready!`,
          body: `${defName} is ready to collect`,
          deepLink: { screen: config.screen, jobId: job.id, defId: job.defId },
          sourceType: 'job_ready',
          sourceId: job.id,
        });
        if (notif) createdNotifs.push(notif);
      } catch (err) {
        logger.warn(`Failed to create job_ready notification for ${job.id}: ${err}`);
      }
    }
  }

  return createdNotifs;
}
