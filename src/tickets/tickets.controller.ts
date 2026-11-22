import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AssignTicketDto } from './dto/assign-ticket.dto.js';
import { ChangeTicketStatusDto } from './dto/change-ticket-status.dto.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto.js';

import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.types.js';

import { TicketsService } from './tickets.service.js';
import { Role } from '../generated/prisma/client.js';

@ApiTags('tickets')
@Controller('tickets')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.MANAGER)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @Roles(Role.WORKER, Role.MANAGER, Role.ADMIN)
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: JwtPayload) {
    return this.ticketsService.create(dto, user.sub, user.orgId);
  }

  @Get()
  @Roles(Role.WORKER, Role.MANAGER, Role.ADMIN)
  findAll(
    @Query() query: ListTicketsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ticketsService.findAll(query, user.orgId);
  }

  @Get(':id')
  @Roles(Role.WORKER, Role.MANAGER, Role.ADMIN)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ticketsService.findOne(id, user.orgId);
  }

  @Patch(':id/status')
  @Roles(Role.WORKER, Role.MANAGER, Role.ADMIN)
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeTicketStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ticketsService.changeStatus(id, dto.status, user.orgId);
  }

  @Patch(':id/assign')
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ticketsService.assign(id, dto.assigneeId, user.orgId);
  }
}
