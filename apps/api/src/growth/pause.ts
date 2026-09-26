// Project-wide Growth pause — stops campaign sends including queued follow-ups.

import { eq } from "drizzle-orm";
import { db, growthAutopilotSettings } from "@nnact/db";

export async function isOrgGrowthSendingPaused(orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ paused: growthAutopilotSettings.paused })
    .from(growthAutopilotSettings)
    .where(eq(growthAutopilotSettings.orgId, orgId))
    .limit(1);
  return Boolean(row?.paused);
}
