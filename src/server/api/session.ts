import "server-only";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { ApiError, errorResponse } from "./protocol";

export async function authenticatedApi(run: () => Promise<Response>): Promise<Response> {
  try {
    const unauthorized = () => new ApiError({ error: { code: "unauthorized", message: "Sign in to continue." } });
    if (!getSupabaseConfig()) throw unauthorized();
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw unauthorized();
    return await run();
  } catch (error) {
    return errorResponse(error);
  }
}
