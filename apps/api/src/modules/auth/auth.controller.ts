import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import {
  SessionAuthGuard,
  type RequestWithUser,
} from "./session-auth.guard";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
} from "./session";

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("auth/login")
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(body.email, body.password);
    const token = createSessionToken({ sub: user.id, email: user.email });
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
    return { user };
  }

  @Post("auth/logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME, {
      path: sessionCookieOptions.path,
    });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  me(@Req() req: RequestWithUser) {
    return { user: req.user };
  }
}
