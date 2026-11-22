import { IsEnum } from 'class-validator';
import { TicketStatus } from '../../generated/prisma/client.js';

export class ChangeTicketStatusDto {
  @IsEnum(TicketStatus)
  status: TicketStatus;
}
