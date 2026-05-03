import { Controller, Get, Post, Param, Body, UseGuards, Headers } from '@nestjs/common';
import { LocationService } from './location.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyService } from '../infrastructure/idempotency.service';

@Controller('locations')
@UseGuards(JwtAuthGuard)
export class LocationController {
  constructor(
    private locationService: LocationService,
    private idempotency: IdempotencyService,
  ) {}

  @Get()
  getLocations(@CurrentUser() user: { id: string }) {
    return this.locationService.getLocations(user.id);
  }

  @Get(':id')
  getLocation(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.locationService.getLocation(user.id, id);
  }

  @Get(':id/available-buildings')
  getAvailableBuildings(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.locationService.getAvailableBuildings(user.id, id);
  }

  @Post(':id/claim')
  claimLocation(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.executeIdempotent(
      user.id,
      `POST:/locations/${id}/claim`,
      idempotencyKey,
      { locationId: id },
      () => this.locationService.claimLocation(user.id, id),
    );
  }

  @Post(':id/build')
  buildBuilding(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() body: { buildingDefId: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.executeIdempotent(
      user.id,
      `POST:/locations/${id}/build`,
      idempotencyKey,
      { locationId: id, buildingDefId: body.buildingDefId },
      () => this.locationService.buildBuilding(user.id, id, body.buildingDefId),
    );
  }

  @Post(':id/buildings/:buildingId/complete')
  completeBuilding(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('buildingId') buildingId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.executeIdempotent(
      user.id,
      `POST:/locations/${id}/buildings/${buildingId}/complete`,
      idempotencyKey,
      { locationId: id, buildingId },
      () => this.locationService.completeBuilding(user.id, id, buildingId),
    );
  }

  @Post(':id/buildings/:buildingId/upgrade')
  upgradeBuilding(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('buildingId') buildingId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.executeIdempotent(
      user.id,
      `POST:/locations/${id}/buildings/${buildingId}/upgrade`,
      idempotencyKey,
      { locationId: id, buildingId },
      () => this.locationService.upgradeBuilding(user.id, id, buildingId),
    );
  }

  @Post(':id/workers/assign')
  assignWorker(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() body: { entityId: string },
  ) {
    return this.locationService.assignWorker(user.id, id, body.entityId);
  }

  @Post(':id/workers/:entityId/remove')
  removeWorker(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('entityId') entityId: string,
  ) {
    return this.locationService.removeWorker(user.id, id, entityId);
  }

  @Post(':id/toggle')
  toggleLocation(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.locationService.toggleLocationEnabled(user.id, id, body.enabled);
  }

  @Post(':id/buildings/:buildingId/toggle')
  toggleBuilding(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('buildingId') buildingId: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.locationService.toggleBuildingEnabled(user.id, id, buildingId, body.enabled);
  }

  @Post(':id/rooms/:roomId/toggle')
  toggleRoom(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('roomId') roomId: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.locationService.toggleRoomEnabled(user.id, id, roomId, body.enabled);
  }
}
