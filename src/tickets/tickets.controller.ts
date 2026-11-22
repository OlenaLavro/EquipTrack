import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AssignTicketDto } from './dto/assign-ticket.dto.js';
import { ChangeTicketStatusDto } from './dto/change-ticket-status.dto.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto.js';
import { TicketsService } from './tickets.service.js';

const TEMP_USER_ID = 2; 

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  create(@Body() dto: CreateTicketDto) {
    return this.ticketsService.create(dto, TEMP_USER_ID);
  }

  @Get()
  findAll(@Query() query: ListTicketsQueryDto) {
    return this.ticketsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ticketsService.findOne(id);
  }

  @Patch(':id/status')
  changeStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeTicketStatusDto) {
    return this.ticketsService.changeStatus(id, dto.status, TEMP_USER_ID);
  }

  @Patch(':id/assign')
  assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignTicketDto) {
    return this.ticketsService.assign(id, dto.assigneeId);
  }
}