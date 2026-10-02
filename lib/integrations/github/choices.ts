import "server-only";
import {cookies} from "next/headers";
import {decryptToken} from "@/lib/security/token-crypto";
import {GITHUB_CHOICES_COOKIE, type UserInstallation} from "./app";

export type GitHubChoices = {
  userId: string;
  organisationId: string;
  installations: UserInstallation[];
  createdAt: number;
};

/** The verified installations saved by the GitHub callback, if still valid for this user. */
export async function readGitHubChoices(userId: string, organisationId: string) {
  const raw = (await cookies()).get(GITHUB_CHOICES_COOKIE)?.value;
  if (!raw) return null;
  try {
    const choices = JSON.parse(decryptToken(raw)) as GitHubChoices;
    return choices.userId === userId &&
      choices.organisationId === organisationId &&
      Date.now() - choices.createdAt < 900_000
      ? choices
      : null;
  } catch {
    return null;
  }
}
