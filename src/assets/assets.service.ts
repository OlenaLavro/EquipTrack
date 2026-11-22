import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ListAssetsQueryDto } from './dto/list-assets-query.dto.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';
import { CreateAssetDto } from './dto/create-asset.dto.js';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAssetDto, orgId: number) {
    const site = await this.prisma.site.findFirst({
      where: {
        id: dto.siteId,
        organizationId: orgId,
      },
    });

    if (!site) {
      throw new NotFoundException(`Site ${dto.siteId} not found`);
    }

    try {
      return await this.prisma.asset.create({ data: dto });
    } catch (e) {
      this.rethrow(e);
    }
  }

  async findAll(
    { page = 1, limit = 20, siteId, status }: ListAssetsQueryDto,
    orgId: number,
  ) {
    const where: Prisma.AssetWhereInput = {
      siteId,
      status,
      site: { organizationId: orgId },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.asset.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.prisma.asset.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number, orgId: number) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        site: { organizationId: orgId },
      },
      include: { site: true },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${id} not found`);
    }

    return asset;
  }

  async findByQr(code: string, orgId: number) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        qrCode: code,
        site: { organizationId: orgId },
      },
      include: { site: true },
    });

    if (!asset) {
      throw new NotFoundException(`Asset with QR "${code}" not found`);
    }

    return asset;
  }

  async update(id: number, dto: UpdateAssetDto, orgId: number) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.asset.findFirst({
        where: {
          id,
          site: { organizationId: orgId },
        },
      });

      if (!existing) {
        throw new NotFoundException(`Asset ${id} not found`);
      }

      if (dto.siteId !== undefined && dto.siteId !== existing.siteId) {
        const targetSite = await tx.site.findFirst({
          where: {
            id: dto.siteId,
            organizationId: orgId,
          },
        });

        if (!targetSite) {
          throw new NotFoundException(`Site ${dto.siteId} not found`);
        }
      }

      try {
        return await tx.asset.update({
          where: { id },
          data: dto,
        });
      } catch (e) {
        this.rethrow(e);
      }
    });
  }

  async remove(id: number, orgId: number) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.asset.findFirst({
        where: {
          id,
          site: { organizationId: orgId },
        },
      });

      if (!existing) {
        throw new NotFoundException(`Asset ${id} not found`);
      }

      try {
        await tx.asset.delete({ where: { id } });
      } catch (e) {
        this.rethrow(e);
      }
    });
  }

  private rethrow(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002')
        throw new ConflictException('Asset with this QR code already exists');
      if (e.code === 'P2003')
        throw new BadRequestException(
          'Cannot delete or modify asset with existing tickets',
        );
      if (e.code === 'P2025') throw new NotFoundException('Asset not found');
    }
    throw e;
  }
}
