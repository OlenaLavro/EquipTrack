import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { AssetsService } from './assets.service.js';
import { CreateAssetDto } from './dto/create-asset.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AssetsService', () => {
  let service: AssetsService;

  const prisma = {
    $transaction: vi.fn(),
    site: { findFirst: vi.fn() },
    asset: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (cb: (tx: typeof prisma) => unknown) => cb(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [AssetsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AssetsService);
  });

  describe('create', () => {
    const orgId = 10;
    const dto: CreateAssetDto = {
      name: 'Main Generator',
      siteId: 5,
    } as CreateAssetDto;

    it('should create and return an asset when site exists', async () => {
      const mockSite = { id: dto.siteId, organizationId: orgId };
      const expectedAsset = { id: 100, ...dto };

      prisma.site.findFirst.mockResolvedValue(mockSite);
      prisma.asset.create.mockResolvedValue(expectedAsset);

      const result = await service.create(dto, orgId);

      expect(result).toEqual(expectedAsset);
      expect(prisma.site.findFirst).toHaveBeenCalledWith({
        where: {
          id: dto.siteId,
          organizationId: orgId,
        },
      });
      expect(prisma.asset.create).toHaveBeenCalledWith({
        data: dto,
      });
    });

    it('throws 404 when site is not found', async () => {
      prisma.site.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, orgId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.site.findFirst).toHaveBeenCalledWith({
        where: { id: dto.siteId, organizationId: orgId },
      });
      expect(prisma.asset.create).not.toHaveBeenCalled();
    });
  });

  describe('findByQr', () => {
    const code = 'QR-12345';
    const orgId = 10;

    it('should return an asset with site when found', async () => {
      const mockAsset = {
        id: 1,
        qrCode: code,
        site: { id: 5, organizationId: orgId },
      };

      prisma.asset.findFirst.mockResolvedValue(mockAsset);

      const result = await service.findByQr(code, orgId);

      expect(result).toEqual(mockAsset);
      expect(prisma.asset.findFirst).toHaveBeenCalledWith({
        where: {
          qrCode: code,
          site: { organizationId: orgId },
        },
        include: { site: true },
      });
    });

    it('throws 404 when asset is not found', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(service.findByQr(code, orgId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.asset.findFirst).toHaveBeenCalledWith({
        where: {
          qrCode: code,
          site: { organizationId: orgId },
        },
        include: { site: true },
      });
    });
  });

  describe('update', () => {
    const assetId = 1;
    const orgId = 10;
    const existingAsset = { id: assetId, name: 'Old Name', siteId: 5 };

    it('should update without checking site if siteId is not changed', async () => {
      const dto = { name: 'New Name' };
      const updatedAsset = { ...existingAsset, ...dto };

      prisma.asset.findFirst.mockResolvedValue(existingAsset);
      prisma.asset.update.mockResolvedValue(updatedAsset);

      const result = await service.update(assetId, dto, orgId);

      expect(result).toEqual(updatedAsset);
      expect(prisma.site.findFirst).not.toHaveBeenCalled();
      expect(prisma.asset.update).toHaveBeenCalledWith({
        where: { id: assetId },
        data: dto,
      });
    });

    it('throws 404 when asset is not found', async () => {
      const dto = { name: 'New Name' };
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(service.update(assetId, dto, orgId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.asset.findFirst).toHaveBeenCalledWith({
        where: {
          id: assetId,
          site: { organizationId: orgId },
        },
      });
      expect(prisma.asset.update).not.toHaveBeenCalled();
    });

    it('should verify new site and update asset when siteId is changed', async () => {
      const dto = { siteId: 99, name: 'Moved Asset' };
      const targetSite = { id: 99, organizationId: orgId };
      const updatedAsset = { id: assetId, ...dto };

      prisma.asset.findFirst.mockResolvedValue(existingAsset);
      prisma.site.findFirst.mockResolvedValue(targetSite);
      prisma.asset.update.mockResolvedValue(updatedAsset);

      const result = await service.update(assetId, dto, orgId);

      expect(result).toEqual(updatedAsset);
      expect(prisma.site.findFirst).toHaveBeenCalledWith({
        where: { id: dto.siteId, organizationId: orgId },
      });
      expect(prisma.asset.update).toHaveBeenCalledWith({
        where: { id: assetId },
        data: dto,
      });
    });

    it('should throw 404 when new siteId does not exist or belongs to another org', async () => {
      const dto = { siteId: 99 };

      prisma.asset.findFirst.mockResolvedValue(existingAsset);
      prisma.site.findFirst.mockResolvedValue(null);

      await expect(service.update(assetId, dto, orgId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.asset.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const assetId = 4;
    const orgId = 10;

    it('throws 404 when asset is not found', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(service.remove(assetId, orgId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.asset.findFirst).toHaveBeenCalledWith({
        where: {
          id: assetId,
          site: { organizationId: orgId },
        },
      });
      expect(prisma.asset.delete).not.toHaveBeenCalled();
    });

    it('should delete the asset when found', async () => {
      const existingAsset = { id: assetId, name: 'To Be Deleted' };
      prisma.asset.findFirst.mockResolvedValue(existingAsset);
      prisma.asset.delete.mockResolvedValue(existingAsset);

      const result = await service.remove(assetId, orgId);

      expect(result).toBeUndefined();
      expect(prisma.asset.findFirst).toHaveBeenCalledWith({
        where: {
          id: assetId,
          site: { organizationId: orgId },
        },
      });
      expect(prisma.asset.delete).toHaveBeenCalledWith({
        where: { id: assetId },
      });
    });
  });
});
