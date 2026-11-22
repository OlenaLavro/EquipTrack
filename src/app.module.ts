import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module.js';
import { AssetsModule } from './assets/assets.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AssetsModule,
    TicketsModule,
    AuthModule,
  ],
})
export class AppModule {}
