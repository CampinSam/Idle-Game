import { Injectable, BadRequestException } from '@nestjs/common';
import { CommandHandler } from './command.types';
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
import { ClaimAchievementRewardHandler } from './handlers/claim-achievement-reward.handler';
import { ShopPurchaseHandler } from './handlers/shop-purchase.handler';
import { UseConsumableHandler } from './handlers/use-consumable.handler';
import { ClaimGiftHandler } from './handlers/claim-gift.handler';
import { EquipItemHandler } from './handlers/equip-item.handler';
import { UnequipItemHandler } from './handlers/unequip-item.handler';
import { DepositLocationXpHandler } from './handlers/deposit-location-xp.handler';
import { RenameEntityHandler } from './handlers/rename-entity.handler';
import { SetPrimaryOutpostHandler } from './handlers/set-primary-outpost.handler';
import { TriggerLocationPowerHandler } from './handlers/trigger-location-power.handler';
import { TriggerEntityPowerHandler } from './handlers/trigger-entity-power.handler';
import { StartDustingHandler } from './handlers/start-dusting.handler';
import { CollectDustingHandler } from './handlers/collect-dusting.handler';
import { SwapOutpostHandler } from './handlers/swap-outpost.handler';
import { ClaimCheckInHandler } from './handlers/claim-checkin.handler';
import { ContinueMissionHandler } from './handlers/continue-mission.handler';
import { AbandonMissionHandler } from './handlers/abandon-mission.handler';

@Injectable()
export class CommandRouter {
  private handlers = new Map<string, CommandHandler>();

  constructor(
    private startMission: StartMissionHandler,
    private completeMission: CompleteMissionHandler,
    private continueMission: ContinueMissionHandler,
    private abandonMission: AbandonMissionHandler,
    private claimReward: ClaimRewardHandler,
    private startCrafting: StartCraftingHandler,
    private collectCrafting: CollectCraftingHandler,
    private claimLocation: ClaimLocationHandler,
    private buildBuilding: BuildBuildingHandler,
    private completeBuilding: CompleteBuildingHandler,
    private upgradeBuilding: UpgradeBuildingHandler,
    private assignWorker: AssignWorkerHandler,
    private removeWorker: RemoveWorkerHandler,
    private toggleLocation: ToggleLocationHandler,
    private toggleBuilding: ToggleBuildingHandler,
    private toggleRoom: ToggleRoomHandler,
    private openGiftPackage: OpenGiftPackageHandler,
    private openLootBox: OpenLootBoxHandler,
    private claimQuestReward: ClaimQuestRewardHandler,
    private claimAchievementReward: ClaimAchievementRewardHandler,
    private shopPurchase: ShopPurchaseHandler,
    private useConsumable: UseConsumableHandler,
    private claimGift: ClaimGiftHandler,
    private equipItem: EquipItemHandler,
    private unequipItem: UnequipItemHandler,
    private depositLocationXp: DepositLocationXpHandler,
    private renameEntity: RenameEntityHandler,
    private setPrimaryOutpost: SetPrimaryOutpostHandler,
    private triggerLocationPower: TriggerLocationPowerHandler,
    private triggerEntityPower: TriggerEntityPowerHandler,
    private startDusting: StartDustingHandler,
    private collectDusting: CollectDustingHandler,
    private swapOutpost: SwapOutpostHandler,
    private claimCheckIn: ClaimCheckInHandler,
  ) {
    this.handlers.set('StartMission', this.startMission);
    this.handlers.set('CompleteMission', this.completeMission);
    this.handlers.set('ContinueMission', this.continueMission);
    this.handlers.set('AbandonMission', this.abandonMission);
    this.handlers.set('ClaimReward', this.claimReward);
    this.handlers.set('StartCrafting', this.startCrafting);
    this.handlers.set('CollectCrafting', this.collectCrafting);
    this.handlers.set('ClaimLocation', this.claimLocation);
    this.handlers.set('BuildBuilding', this.buildBuilding);
    this.handlers.set('CompleteBuilding', this.completeBuilding);
    this.handlers.set('UpgradeBuilding', this.upgradeBuilding);
    this.handlers.set('AssignWorker', this.assignWorker);
    this.handlers.set('RemoveWorker', this.removeWorker);
    this.handlers.set('ToggleLocation', this.toggleLocation);
    this.handlers.set('ToggleBuilding', this.toggleBuilding);
    this.handlers.set('ToggleRoom', this.toggleRoom);
    this.handlers.set('OpenGiftPackage', this.openGiftPackage);
    this.handlers.set('OpenLootBox', this.openLootBox);
    this.handlers.set('ClaimQuestReward', this.claimQuestReward);
    this.handlers.set('ClaimAchievementReward', this.claimAchievementReward);
    this.handlers.set('ShopPurchase', this.shopPurchase);
    this.handlers.set('UseConsumable', this.useConsumable);
    this.handlers.set('ClaimGift', this.claimGift);
    this.handlers.set('EquipItem', this.equipItem);
    this.handlers.set('UnequipItem', this.unequipItem);
    this.handlers.set('DepositLocationXp', this.depositLocationXp);
    this.handlers.set('RenameEntity', this.renameEntity);
    this.handlers.set('SetPrimaryOutpost', this.setPrimaryOutpost);
    this.handlers.set('TriggerLocationPower', this.triggerLocationPower);
    this.handlers.set('TriggerEntityPower', this.triggerEntityPower);
    this.handlers.set('StartDusting', this.startDusting);
    this.handlers.set('CollectDusting', this.collectDusting);
    this.handlers.set('SwapOutpost', this.swapOutpost);
    this.handlers.set('ClaimCheckIn', this.claimCheckIn);
  }

  resolve(commandType: string): CommandHandler {
    const handler = this.handlers.get(commandType);
    if (!handler) {
      throw new BadRequestException(`Unknown command type: ${commandType}`);
    }
    return handler;
  }

  listCommands(): string[] {
    return Array.from(this.handlers.keys());
  }
}
