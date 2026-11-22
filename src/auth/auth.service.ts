import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from './auth.types.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      orgId: user.organizationId,
    };
    return { accessToken: await this.jwt.signAsync(payload) };
  }
}
