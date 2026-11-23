import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TicketsService, canTransition } from './tickets.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AssetStatus, TicketStatus } from '../generated/prisma/enums.js';

describe('canTransition', () => {
  it.each([
    [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, true],
    [TicketStatus.OPEN, TicketStatus.DONE, true],
    [TicketStatus.OPEN, TicketStatus.REJECTED, true],
    [TicketStatus.IN_PROGRESS, TicketStatus.OPEN, true],
    [TicketStatus.IN_PROGRESS, TicketStatus.DONE, true],
    [TicketStatus.IN_PROGRESS, TicketStatus.REJECTED, true],
    [TicketStatus.OPEN, TicketStatus.OPEN, false],
    [TicketStatus.DONE, TicketStatus.OPEN, false],
    [TicketStatus.REJECTED, TicketStatus.IN_PROGRESS, false],
  ])('%s → %s = %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });
});

describe('TicketsService', () => {
  let service: TicketsService;

  const orgId = 100;
  const userId = 7;
  const assigneeId = 42;
  const assetId = 1;
  const ticketId = 10;

  const prisma = {
    $transaction: vi.fn(),
    asset: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    ticket: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    user: { findFirst: vi.fn() },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (cb: (tx: typeof prisma) => unknown) => cb(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [TicketsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(TicketsService);
  });

  describe('create', () => {
    const dto = { assetId, title: 'Hydraulic leak' };

    it('creates OPEN ticket and marks asset BROKEN', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: assetId,
        status: AssetStatus.ACTIVE,
      });
      prisma.ticket.create.mockResolvedValue({
        id: ticketId,
        status: TicketStatus.OPEN,
      });

      const result = await service.create(dto, userId, orgId);

      expect(result).toEqual({ id: ticketId, status: TicketStatus.OPEN });
      expect(prisma.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assetId,
          reportedById: userId,
          status: TicketStatus.OPEN,
        }),
      });
      expect(prisma.asset.update).toHaveBeenCalledWith({
        where: { id: assetId },
        data: { status: AssetStatus.BROKEN },
      });
    });

    it('throws 404 when asset is not in user organization', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, userId, orgId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.asset.findFirst).toHaveBeenCalledWith({
        where: { id: assetId, site: { organizationId: orgId } },
      });
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });

    it('throws 409 for retired asset', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: assetId,
        status: AssetStatus.RETIRED,
      });

      await expect(service.create(dto, userId, orgId)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });
  });

  describe('changeStatus', () => {
    it('throws 404 when ticket is not found', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(ticketId, TicketStatus.IN_PROGRESS, orgId),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
    });

    it('throws 409 on forbidden transition', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: ticketId,
        assetId,
        status: TicketStatus.DONE,
      });

      await expect(
        service.changeStatus(ticketId, TicketStatus.OPEN, orgId),
      ).rejects.toThrow(ConflictException);
      expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
    });

    it('throws 409 when ticket was changed concurrently', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: ticketId,
        assetId,
        status: TicketStatus.IN_PROGRESS,
      });
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.changeStatus(ticketId, TicketStatus.DONE, orgId),
      ).rejects.toThrow(ConflictException);
      expect(prisma.asset.updateMany).not.toHaveBeenCalled();
    });

    it.each([TicketStatus.DONE, TicketStatus.REJECTED])(
      'marks asset ACTIVE when transitioning to %s and no other open tickets exist',
      async (targetStatus) => {
        prisma.ticket.findFirst.mockResolvedValue({
          id: ticketId,
          assetId,
          status: TicketStatus.IN_PROGRESS,
        });
        prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
        prisma.ticket.count.mockResolvedValue(0);
        prisma.ticket.findUniqueOrThrow.mockResolvedValue({
          id: ticketId,
          assetId,
          status: targetStatus,
        });

        const result = await service.changeStatus(
          ticketId,
          targetStatus,
          orgId,
        );

        expect(result).toEqual({
          id: ticketId,
          assetId,
          status: targetStatus,
        });
        expect(prisma.ticket.count).toHaveBeenCalledWith({
          where: {
            assetId,
            id: { not: ticketId },
            status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
          },
        });
        expect(prisma.asset.updateMany).toHaveBeenCalledWith({
          where: {
            id: assetId,
            status: { not: AssetStatus.RETIRED },
          },
          data: { status: AssetStatus.ACTIVE },
        });
      },
    );

    it('does not mark asset ACTIVE when another active ticket still exists', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: ticketId,
        assetId,
        status: TicketStatus.IN_PROGRESS,
      });
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticket.count.mockResolvedValue(1);
      prisma.ticket.findUniqueOrThrow.mockResolvedValue({
        id: ticketId,
        assetId,
        status: TicketStatus.DONE,
      });

      await service.changeStatus(ticketId, TicketStatus.DONE, orgId);

      expect(prisma.ticket.count).toHaveBeenCalledTimes(1);
      expect(prisma.asset.updateMany).not.toHaveBeenCalled();
    });

    it('does not touch asset status when transitioning from OPEN to IN_PROGRESS', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: ticketId,
        assetId,
        status: TicketStatus.OPEN,
      });
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticket.findUniqueOrThrow.mockResolvedValue({
        id: ticketId,
        assetId,
        status: TicketStatus.IN_PROGRESS,
      });

      await service.changeStatus(ticketId, TicketStatus.IN_PROGRESS, orgId);

      expect(prisma.ticket.count).not.toHaveBeenCalled();
      expect(prisma.asset.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('assign', () => {
    it('assigns OPEN ticket to user and moves status to IN_PROGRESS', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: ticketId,
        assetId,
        status: TicketStatus.OPEN,
      });
      prisma.user.findFirst.mockResolvedValue({
        id: assigneeId,
        organizationId: orgId,
      });
      prisma.ticket.update.mockResolvedValue({
        id: ticketId,
        assigneeId,
        status: TicketStatus.IN_PROGRESS,
      });

      const result = await service.assign(ticketId, assigneeId, orgId);

      expect(result).toEqual({
        id: ticketId,
        assigneeId,
        status: TicketStatus.IN_PROGRESS,
      });
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: ticketId },
        data: {
          assigneeId,
          status: TicketStatus.IN_PROGRESS,
        },
      });
    });

    it('reassigns IN_PROGRESS ticket without overwriting status', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: ticketId,
        assetId,
        status: TicketStatus.IN_PROGRESS,
      });
      prisma.user.findFirst.mockResolvedValue({
        id: assigneeId,
        organizationId: orgId,
      });
      prisma.ticket.update.mockResolvedValue({
        id: ticketId,
        assigneeId,
        status: TicketStatus.IN_PROGRESS,
      });

      await service.assign(ticketId, assigneeId, orgId);

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: ticketId },
        data: { assigneeId },
      });
    });

    it('throws 404 when ticket is not found', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);

      await expect(service.assign(ticketId, assigneeId, orgId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it.each([TicketStatus.DONE, TicketStatus.REJECTED])(
      'throws 409 when ticket is already %s',
      async (closedStatus) => {
        prisma.ticket.findFirst.mockResolvedValue({
          id: ticketId,
          assetId,
          status: closedStatus,
        });

        await expect(
          service.assign(ticketId, assigneeId, orgId),
        ).rejects.toThrow(ConflictException);
        expect(prisma.user.findFirst).not.toHaveBeenCalled();
        expect(prisma.ticket.update).not.toHaveBeenCalled();
      },
    );
    it('throws 404 when assignee is from another organization', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: ticketId,
        assetId,
        status: TicketStatus.OPEN,
      });
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.assign(ticketId, assigneeId, orgId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: assigneeId, organizationId: orgId },
      });
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });
  });
});
