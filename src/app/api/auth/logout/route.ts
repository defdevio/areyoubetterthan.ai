import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export async function POST() {
  const res = NextResponse.redirect(new URL("/", config.appUrl), 303);
  res.cookies.delete("abt_session");
  return res;
}
