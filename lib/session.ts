import "server-only";

import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  authenticated: boolean;
};

const sessionSecret = process.env.SESSION_SECRET || "";
if (sessionSecret && sessionSecret.length < 32) {
  console.warn("SESSION_SECRET should be 32+ chars");
}

const sessionOptions: SessionOptions = {
  cookieName: "interior_session",
  password: sessionSecret || "a".repeat(32),
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session.authenticated) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}

export function verifyAdminPassword(password: string): boolean {
  const expected = (process.env.ADMIN_PASSWORD || "").trim();
  if (!expected) return false;
  if (password.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ password.charCodeAt(i);
  }
  return mismatch === 0;
}
