import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto.js';

import {
  AssetStatus,
  Prisma,
  TicketStatus,
} from '../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service.js';

export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: [TicketStatus.IN_PROGRESS, TicketStatus.DONE, TicketStatus.REJECTED],
  IN_PROGRESS: [TicketStatus.OPEN, TicketStatus.DONE, TicketStatus.REJECTED],
  DONE: [],
  REJECTED: [],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTicketDto, reportedById: number, orgId: number) {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: {
          id: dto.assetId,
          site: { organizationId: orgId },
        },
      });

      if (!asset) {
        throw new NotFoundException(`Asset ${dto.assetId} not found`);
      }

      if (asset.status === AssetStatus.RETIRED) {
        throw new ConflictException('Cannot create ticket for retired asset');
      }

      const ticket = await tx.ticket.create({
        data: {
          title: dto.title,
          description: dto.description,
          priority: dto.priority,
          photoUrl: dto.photoUrl,
          assetId: asset.id,
          reportedById,
          status: TicketStatus.OPEN,
        },
      });

      await tx.asset.update({
        where: { id: asset.id },
        data: { status: AssetStatus.BROKEN },
      });

      return ticket;
    });
  }

  async changeStatus(id: number, status: TicketStatus, orgId: number) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findFirst({
        where: { id, asset: { site: { organizationId: orgId } } },
      });

      if (!ticket) {
        throw new NotFoundException(`Ticket ${id} not found`);
      }

      if (!canTransition(ticket.status, status)) {
        throw new ConflictException(
          `Cannot change status from ${ticket.status} to ${status}`,
        );
      }

      const updated = await tx.ticket.updateMany({
        where: {
          id,
          status: ticket.status,
        },
        data: { status },
      });

      if (updated.count === 0) {
        throw new ConflictException(
          'Ticket status was modified concurrently. Please retry.',
        );
      }

      if (status === TicketStatus.DONE || status === TicketStatus.REJECTED) {
        const otherOpenTicketsCount = await tx.ticket.count({
          where: {
            assetId: ticket.assetId,
            id: { not: ticket.id },
            status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
          },
        });

        if (otherOpenTicketsCount === 0) {
          await tx.asset.updateMany({
            where: {
              id: ticket.assetId,
              status: { not: AssetStatus.RETIRED },
            },
            data: { status: AssetStatus.ACTIVE },
          });
        }
      }

      return tx.ticket.findUniqueOrThrow({
        where: { id },
      });
    });
  }

  async assign(id: number, assigneeId: number, orgId: number) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findFirst({
        where: { id, asset: { site: { organizationId: orgId } } },
      });

      if (!ticket) {
        throw new NotFoundException(`Ticket ${id} not found`);
      }

      if (
        ticket.status === TicketStatus.DONE ||
        ticket.status === TicketStatus.REJECTED
      ) {
        throw new ConflictException(
          `Cannot assign ticket with status ${ticket.status}`,
        );
      }

      const assignee = await tx.user.findFirst({
        where: {
          id: assigneeId,
          organizationId: orgId,
        },
      });

      if (!assignee) {
        throw new NotFoundException(`User ${assigneeId} not found`);
      }

      return tx.ticket.update({
        where: { id },
        data: {
          assigneeId,
          ...(ticket.status === TicketStatus.OPEN && {
            status: TicketStatus.IN_PROGRESS,
          }),
        },
      });
    });
  }

  async findAll(
    { page, limit, status, assetId, assigneeId }: ListTicketsQueryDto,
    orgId: number,
  ) {
    const where: Prisma.TicketWhereInput = {
      status,
      assetId,
      assigneeId,
      asset: { site: { organizationId: orgId } },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number, orgId: number) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id, asset: { site: { organizationId: orgId } } },
      include: {
        asset: true,
        reportedBy: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }
}
