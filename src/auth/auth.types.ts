import type { Request } from 'express';
import type { Role } from '../generated/prisma/client.js';

export interface JwtPayload {
  sub: number;  
  role: Role;
  orgId: number;
}

export type AuthenticatedRequest = Request & { user: JwtPayload };