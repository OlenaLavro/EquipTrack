import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Public } from './decorators/public.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';

import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import type { JwtPayload } from './auth.types.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }
}
