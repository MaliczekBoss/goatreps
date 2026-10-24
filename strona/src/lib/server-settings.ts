import "server-only";
import { cookies } from "next/headers";
import { parseSettings, SETTINGS_COOKIE } from "./settings";

export async function getSettings() {
  const jar = await cookies();
  return parseSettings(jar.get(SETTINGS_COOKIE)?.value);
}
