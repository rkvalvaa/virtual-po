"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/session";
import { getFeatureRequestById } from "@/lib/db/queries/feature-requests";
import { upsertVote, deleteVote } from "@/lib/db/queries/votes";
import "@/lib/auth/types";

export async function submitVote(
  requestId: string,
  voteValue: number,
  rationale: string | null
) {
  const session = await requireAuth();

  if (voteValue < 1 || voteValue > 5 || !Number.isInteger(voteValue)) {
    throw new Error("Vote value must be an integer between 1 and 5");
  }

  const request = await getFeatureRequestById(requestId);
  if (!request) {
    throw new Error("Feature request not found");
  }
  if (request.organizationId !== session.user.orgId) {
    throw new Error("Feature request not found");
  }

  await upsertVote(requestId, session.user.id, voteValue, rationale);
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  revalidatePath("/review");
  revalidatePath("/backlog");
}

export async function removeVote(requestId: string) {
  const session = await requireAuth();

  const request = await getFeatureRequestById(requestId);
  if (!request) {
    throw new Error("Feature request not found");
  }
  if (request.organizationId !== session.user.orgId) {
    throw new Error("Feature request not found");
  }

  await deleteVote(requestId, session.user.id);
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  revalidatePath("/review");
  revalidatePath("/backlog");
}
