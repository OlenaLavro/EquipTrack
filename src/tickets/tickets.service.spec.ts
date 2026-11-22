import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TicketsService, canTransition } from './tickets.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AssetStatus, TicketStatus } from '../generated/prisma/enums.js';

describe('canTransition', () => {
  it.each([
    [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, true],
    [TicketStatus.IN_PROGRESS, TicketStatus.DONE, true],
    [TicketStatus.IN_PROGRESS, TicketStatus.OPEN, true],
    [TicketStatus.OPEN, TicketStatus.OPEN, false],
    [TicketStatus.DONE, TicketStatus.OPEN, false],
    [TicketStatus.REJECTED, TicketStatus.IN_PROGRESS, false],
  ])('%s → %s = %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });
});

describe('TicketsService', () => {
  let service: TicketsService;

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
    const dto = { assetId: 1, title: 'Hydraulic leak' };

    it('creates OPEN ticket and marks asset BROKEN', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: 1,
        status: AssetStatus.ACTIVE,
      });
      prisma.ticket.create.mockResolvedValue({
        id: 10,
        status: TicketStatus.OPEN,
      });

      const result = await service.create(dto, 7, 100);

      expect(result).toEqual({ id: 10, status: TicketStatus.OPEN });
      expect(prisma.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assetId: 1,
          reportedById: 7,
          status: TicketStatus.OPEN,
        }),
      });
      expect(prisma.asset.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: AssetStatus.BROKEN },
      });
    });

    it('throws 404 when asset is not in user organization', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, 7, 100)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.asset.findFirst).toHaveBeenCalledWith({
        where: { id: 1, site: { organizationId: 100 } },
      });
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });

    it('throws 409 for retired asset', async () => {
      prisma.asset.findFirst.mockResolvedValue({
        id: 1,
        status: AssetStatus.RETIRED,
      });

      await expect(service.create(dto, 7, 100)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });
  });

  describe('changeStatus', () => {
    it('throws 409 on forbidden transition', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: 10,
        assetId: 1,
        status: TicketStatus.DONE,
      });

      await expect(
        service.changeStatus(10, TicketStatus.OPEN, 100),
      ).rejects.toThrow(ConflictException);
      expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
    });

    it('throws 409 when ticket was changed concurrently', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: 10,
        assetId: 1,
        status: TicketStatus.IN_PROGRESS,
      });
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.changeStatus(10, TicketStatus.DONE, 100),
      ).rejects.toThrow(ConflictException);
      expect(prisma.asset.updateMany).not.toHaveBeenCalled();
    });

    it('marks asset ACTIVE when all other tickets are done', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: 10,
        assetId: 1,
        status: TicketStatus.IN_PROGRESS,
      });

      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticket.count.mockResolvedValue(0);
      prisma.ticket.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        assetId: 1,
        status: TicketStatus.DONE,
      });
      const result = await service.changeStatus(10, TicketStatus.DONE, 100);
      expect(result).toEqual({
        id: 10,
        assetId: 1,
        status: TicketStatus.DONE,
      });
      expect(prisma.ticket.count).toHaveBeenCalledWith({
        where: {
          assetId: 1,
          id: { not: 10 },
          status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
        },
      });
      expect(prisma.asset.updateMany).toHaveBeenCalledWith({
        where: {
          id: 1,
          status: { not: AssetStatus.RETIRED },
        },
        data: { status: AssetStatus.ACTIVE },
      });
    });

    it('does not mark asset ACTIVE when another active ticket still exists', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: 10,
        assetId: 1,
        status: TicketStatus.IN_PROGRESS,
      });
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticket.count.mockResolvedValue(1);
      prisma.ticket.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        assetId: 1,
        status: TicketStatus.DONE,
      });

      await service.changeStatus(10, TicketStatus.DONE, 100);

      expect(prisma.ticket.count).toHaveBeenCalledTimes(1);
      expect(prisma.asset.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('assign', () => {
    it('throws 404 when assignee is from another organization', async () => {
      prisma.ticket.findFirst.mockResolvedValue({
        id: 10,
        assetId: 1,
        status: TicketStatus.OPEN,
      });
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.assign(10, 42, 100)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 42, organizationId: 100 },
      });
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });
  });
});
