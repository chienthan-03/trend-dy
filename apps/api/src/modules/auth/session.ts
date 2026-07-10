import jwt from "jsonwebtoken";

export const SESSION_COOKIE_NAME = "session";

export type SessionPayload = {
  sub: string;
  email: string;
};

const getSessionSecret = (): string => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required");
  }
  return secret;
};

export const createSessionToken = (payload: SessionPayload): string => {
  return jwt.sign(payload, getSessionSecret(), { expiresIn: "7d" });
};

export const verifySessionToken = (token: string): SessionPayload => {
  const decoded = jwt.verify(token, getSessionSecret());
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof decoded.sub !== "string" ||
    typeof decoded.email !== "string"
  ) {
    throw new Error("Invalid session token");
  }
  return { sub: decoded.sub, email: decoded.email };
};

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
