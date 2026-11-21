import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAssetDto } from './dto/create-asset.dto.js';
import { ListAssetsQueryDto } from './dto/list-assets-query.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAssetDto) {
    try {
      return await this.prisma.asset.create({ data: dto });
    } catch (e) {
      this.rethrow(e);
    }
  }

  async findAll({ page, limit, siteId, status }: ListAssetsQueryDto) {
    const where: Prisma.AssetWhereInput = { siteId, status };

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

  async findOne(id: number) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: { site: true },
    });
    if (!asset) throw new NotFoundException(`Asset ${id} not found`);
    return asset;
  }

  async findByQr(code: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { qrCode: code },
      include: { site: true },
    });
    if (!asset)
      throw new NotFoundException(`Asset with QR "${code}" not found`);
    return asset;
  }

  async update(id: number, dto: UpdateAssetDto) {
    try {
      return await this.prisma.asset.update({ where: { id }, data: dto });
    } catch (e) {
      this.rethrow(e);
    }
  }

  async remove(id: number) {
    try {
      await this.prisma.asset.delete({ where: { id } });
    } catch (e) {
      this.rethrow(e);
    }
  }

  private rethrow(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002')
        throw new ConflictException('Asset with this QR code already exists');
      if (e.code === 'P2003')
        throw new BadRequestException('Related record constraint failed');
      if (e.code === 'P2025') throw new NotFoundException('Asset not found');
    }
    throw e;
  }
}
