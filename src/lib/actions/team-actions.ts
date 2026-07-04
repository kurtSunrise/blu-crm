"use server";

import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { account, session as sessionTable, user } from "@/db/schema";
import { runAction } from "@/lib/actions/run-action";
import { requireAdmin } from "@/lib/session";

const TEAM_PATH = "/settings/team";
const MIN_PASSWORD_LENGTH = 8;

const roleSchema = z.enum(["admin", "sales"]);

const addTeamMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  role: roleSchema,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, "Password must be at least 8 characters"),
});

const setMemberRoleSchema = z.object({
  userId: z.string().min(1),
  role: roleSchema,
});

const setMemberDisabledSchema = z.object({
  userId: z.string().min(1),
  disabled: z.boolean(),
});

export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;
export type SetMemberRoleInput = z.infer<typeof setMemberRoleSchema>;
export type SetMemberDisabledInput = z.infer<typeof setMemberDisabledSchema>;

export type TeamActionResult = { ok: true } | { ok: false; error: string };

// runAction expects the { error?: string } action-state shape, not the team
// actions' discriminated { ok } result, so translate at the boundary: success
// becomes {} inside runAction and is mapped back to { ok: true }, while both
// action errors and runAction's infra-failure fallback come back as { error }
// and are mapped to { ok: false }.
const runTeamAction = async (
  work: () => Promise<TeamActionResult>
): Promise<TeamActionResult> => {
  const result = await runAction(async (): Promise<{ error?: string }> => {
    const outcome = await work();
    return outcome.ok ? {} : { error: outcome.error };
  });
  return result.error === undefined
    ? { ok: true }
    : { ok: false, error: result.error };
};

// Count admins who can still sign in (an admin who is disabled can't act as
// one), so the "last admin" guards never strand the workspace.
const countActiveAdmins = async (): Promise<number> => {
  const admins = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.disabled, false)));
  return admins.length;
};

// Creates the member by inserting rows directly (mirroring src/db/seed.ts)
// rather than going through signUp/signIn, so the acting admin's session and
// cookies are never touched.
export const addTeamMember = async (
  input: AddTeamMemberInput
): Promise<TeamActionResult> =>
  runTeamAction(async () => {
    await requireAdmin();

    const parsed = addTeamMemberSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const { name, email, role, password } = parsed.data;

    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    if (existing) {
      return { ok: false, error: "A member with that email already exists" };
    }

    const userId = crypto.randomUUID();
    const now = new Date();

    await db.insert(user).values({
      id: userId,
      name,
      email,
      emailVerified: false,
      role,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: await hashPassword(password),
      createdAt: now,
      updatedAt: now,
    });

    revalidatePath(TEAM_PATH);
    return { ok: true };
  });

export const setMemberRole = async (
  input: SetMemberRoleInput
): Promise<TeamActionResult> =>
  runTeamAction(async () => {
    await requireAdmin();

    const parsed = setMemberRoleSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Invalid input" };
    }
    const { userId, role } = parsed.data;

    const [target] = await db
      .select({ id: user.id, role: user.role, disabled: user.disabled })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!target) {
      return { ok: false, error: "Unknown member" };
    }

    // Don't strand the workspace: refuse to demote the only active admin.
    const demotingAnAdmin =
      target.role === "admin" && !target.disabled && role !== "admin";
    if (demotingAnAdmin && (await countActiveAdmins()) <= 1) {
      return { ok: false, error: "Cannot demote the last remaining admin" };
    }

    await db
      .update(user)
      .set({ role, updatedAt: new Date() })
      .where(eq(user.id, userId));

    revalidatePath(TEAM_PATH);
    return { ok: true };
  });

export const setMemberDisabled = async (
  input: SetMemberDisabledInput
): Promise<TeamActionResult> =>
  runTeamAction(async () => {
    const session = await requireAdmin();

    const parsed = setMemberDisabledSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Invalid input" };
    }
    const { userId, disabled } = parsed.data;

    if (disabled && userId === session.user.id) {
      return { ok: false, error: "You cannot disable your own account" };
    }

    const [target] = await db
      .select({ id: user.id, role: user.role, disabled: user.disabled })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!target) {
      return { ok: false, error: "Unknown member" };
    }

    // Don't strand the workspace: refuse to disable the only active admin.
    const disablingAnActiveAdmin =
      disabled && target.role === "admin" && !target.disabled;
    if (disablingAnActiveAdmin && (await countActiveAdmins()) <= 1) {
      return { ok: false, error: "Cannot disable the last remaining admin" };
    }

    await db
      .update(user)
      .set({ disabled, updatedAt: new Date() })
      .where(eq(user.id, userId));

    // Revoke any live sessions so a disabled member is signed out immediately,
    // not just blocked from signing in again.
    if (disabled) {
      await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
    }

    revalidatePath(TEAM_PATH);
    return { ok: true };
  });
