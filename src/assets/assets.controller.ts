import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CreateAssetDto } from './dto/create-asset.dto.js';
import { ListAssetsQueryDto } from './dto/list-assets-query.dto.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';

import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.types.js';

import { AssetsService } from './assets.service.js';
import { Role } from '../generated/prisma/client.js';

@ApiTags('assets')
@Controller('assets')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.MANAGER)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post()
  create(@Body() dto: CreateAssetDto, @CurrentUser() user: JwtPayload) {
    return this.assetsService.create(dto, user.orgId);
  }

  @Get()
  @Roles(Role.WORKER, Role.MANAGER, Role.ADMIN)
  findAll(@Query() query: ListAssetsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.assetsService.findAll(query, user.orgId);
  }

  @Get('by-qr/:code')
  @Roles(Role.WORKER, Role.MANAGER, Role.ADMIN)
  findByQr(@Param('code') code: string, @CurrentUser() user: JwtPayload) {
    return this.assetsService.findByQr(code, user.orgId);
  }

  @Get(':id')
  @Roles(Role.WORKER, Role.MANAGER, Role.ADMIN)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.assetsService.findOne(id, user.orgId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.assetsService.update(id, dto, user.orgId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.assetsService.remove(id, user.orgId);
  }
}
