import { Global, Module } from '@nestjs/common';
import { SelectionResolverService } from './selection-resolver.service';

@Global()
@Module({
  providers: [SelectionResolverService],
  exports: [SelectionResolverService],
})
export class SelectionModule {}
