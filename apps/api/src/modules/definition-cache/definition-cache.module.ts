import { Global, Module } from '@nestjs/common';
import { DefinitionCacheService } from './definition-cache.service';

/**
 * Global definition cache module.
 *
 * Marked `@Global()` so DefinitionCacheService is available throughout the
 * application without each consuming module adding DefinitionCacheModule to
 * its `imports` array. PrismaModule is imported by the root AppModule and
 * its PrismaService is available here via the global provider graph.
 */
@Global()
@Module({
  providers: [DefinitionCacheService],
  exports: [DefinitionCacheService],
})
export class DefinitionCacheModule {}
