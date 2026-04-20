import { NextRequest, NextResponse } from "next/server";

import { getSession, verifyAdminPassword } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({ password: "" }))) as {
    password?: string;
  };

  if (!password || !verifyAdminPassword(password)) {
    return NextResponse.json({ error: "invalid password" }, { status: 401 });
  }

  const session = await getSession();
  session.authenticated = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
