"use server";

import { ObjectId } from "mongodb";
import { cookies } from "next/headers";

import {
  createSessionToken,
  getSessionMaxAgeSeconds,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

const SESSION_COOKIE = "session";

async function setSessionCookie(userId: string, email: string) {
  const token = createSessionToken(userId, email);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    maxAge: getSessionMaxAgeSeconds(),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function signUp({ name, email, password }: SignUpParams) {
  try {
    const db = await getDb();
    const users = db.collection("users");

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await users.findOne({ email: normalizedEmail });
    if (existing) {
      return { success: false, message: "User already exists" };
    }

    const inserted = await users.insertOne({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    });

    await setSessionCookie(inserted.insertedId.toString(), normalizedEmail);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, message: "Signup failed" };
  }
}

export async function signIn({ email, password }: SignInParams) {
  try {
    const db = await getDb();
    const users = db.collection("users");
    const normalizedEmail = email.trim().toLowerCase();

    const user = await users.findOne({ email: normalizedEmail });
    if (!user || typeof user.passwordHash !== "string") {
      return { success: false, message: "Invalid email or password" };
    }

    const ok = verifyPassword(password, user.passwordHash);
    if (!ok) {
      return { success: false, message: "Invalid email or password" };
    }

    await setSessionCookie(user._id.toString(), normalizedEmail);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, message: "Sign in failed" };
  }
}

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return null;

  const payload = verifySessionToken(sessionToken);
  if (!payload) return null;

  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({
      _id: new ObjectId(payload.userId),
    });

    if (!user) return null;

    return {
      id: user._id.toString(),
      name: String(user.name || ""),
      email: String(user.email || ""),
    };
  } catch {
    return null;
  }
}

export async function isAuthenticated() {
  return !!(await getCurrentUser());
}
