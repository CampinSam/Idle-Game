import { Module } from '@nestjs/common';
import { CommandService } from './command.service';
import { CommandRouter } from './command.router';
import { CommandController } from './command.controller';
import { ExampleTestCommandHandler } from './handlers/example-test.handler';
import { StartMissionHandler } from './handlers/start-mission.handler';
import { CompleteMissionHandler } from './handlers/complete-mission.handler';
import { ClaimRewardHandler } from './handlers/claim-reward.handler';
import { StartCraftingHandler } from './handlers/start-crafting.handler';
import { CollectCraftingHandler } from './handlers/collect-crafting.handler';
import { ClaimLocationHandler } from './handlers/claim-location.handler';
import { BuildBuildingHandler } from './handlers/build-building.handler';
import { CompleteBuildingHandler } from './handlers/complete-building.handler';
import { UpgradeBuildingHandler } from './handlers/upgrade-building.handler';
import { AssignWorkerHandler } from './handlers/assign-worker.handler';
import { RemoveWorkerHandler } from './handlers/remove-worker.handler';
import { ToggleLocationHandler } from './handlers/toggle-location.handler';
import { ToggleBuildingHandler } from './handlers/toggle-building.handler';
import { ToggleRoomHandler } from './handlers/toggle-room.handler';
import { OpenGiftPackageHandler } from './handlers/open-gift-package.handler';
import { OpenLootBoxHandler } from './handlers/open-lootbox.handler';
import { ClaimQuestRewardHandler } from './handlers/claim-quest-reward.handler';
import { ShopPurchaseHandler } from './handlers/shop-purchase.handler';
import { UseConsumableHandler } from './handlers/use-consumable.handler';
import { ClaimGiftHandler } from './handlers/claim-gift.handler';
import { MissionModule } from '../mission/mission.module';
import { CraftingModule } from '../crafting/crafting.module';
import { LocationModule } from '../location/location.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { CurrencyModule } from '../currency/currency.module';
import { InventoryModule } from '../inventory/inventory.module';
import { GameRulesModule } from '../game-rules/game-rules.module';
import { QuestModule } from '../quest/quest.module';
import { EntityModule } from '../entity/entity.module';
import { GiftModule } from '../gift/gift.module';

@Module({
  imports: [
    MissionModule,
    CraftingModule,
    LocationModule,
    TelemetryModule,
    CurrencyModule,
    InventoryModule,
    GameRulesModule,
    QuestModule,
    EntityModule,
    GiftModule,
  ],
  controllers: [CommandController],
  providers: [
    CommandService,
    CommandRouter,
    ExampleTestCommandHandler,
    StartMissionHandler,
    CompleteMissionHandler,
    ClaimRewardHandler,
    StartCraftingHandler,
    CollectCraftingHandler,
    ClaimLocationHandler,
    BuildBuildingHandler,
    CompleteBuildingHandler,
    UpgradeBuildingHandler,
    AssignWorkerHandler,
    RemoveWorkerHandler,
    ToggleLocationHandler,
    ToggleBuildingHandler,
    ToggleRoomHandler,
    OpenGiftPackageHandler,
    OpenLootBoxHandler,
    ClaimQuestRewardHandler,
    ShopPurchaseHandler,
    UseConsumableHandler,
    ClaimGiftHandler,
  ],
  exports: [CommandService],
})
export class CommandsModule {}
