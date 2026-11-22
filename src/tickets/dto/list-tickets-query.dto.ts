import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { TicketStatus } from '../../generated/prisma/client.js';

export class ListTicketsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assetId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assigneeId?: number;
}
