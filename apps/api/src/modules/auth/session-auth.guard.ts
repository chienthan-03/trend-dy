import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService, type AuthUser } from "./auth.service";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";

export type RequestWithUser = Request & { user?: AuthUser };

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (!token || typeof token !== "string") {
      throw new UnauthorizedException("Not authenticated");
    }

    try {
      const payload = verifySessionToken(token);
      const user = await this.authService.findUserById(payload.sub);
      if (!user) {
        throw new UnauthorizedException("Not authenticated");
      }
      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException("Not authenticated");
    }
  }
}
