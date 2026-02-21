import { Global, Module } from '@nestjs/common';
import { GameRulesService } from './game-rules.service';

@Global()
@Module({
  providers: [GameRulesService],
  exports: [GameRulesService],
})
export class GameRulesModule {}
