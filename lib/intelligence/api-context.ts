import "server-only";
import {NextResponse} from "next/server";
import {z} from "zod";
import {organisationApiContext} from "@/lib/organisations/api-context";
export const insightApiContext = organisationApiContext;

export const isInsightId = (id: string) => z.uuid().safeParse(id).success;

/** Logs the raw database error server-side and returns a generic response so table/column details never reach the client. */
export function insightDatabaseError(code: string, error: {message: string}) {
  console.error(`Insight API ${code}`, error.message);
  return NextResponse.json(
    {error: {code, message: "The request could not be completed. Please try again."}},
    {status: 500},
  );
}
