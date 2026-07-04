import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * service-role 클라이언트 — RLS를 우회한다. 서버 전용(server-only 강제).
 * 반드시 호출부에서 admin 권한/서버 시간 검증을 마친 뒤에만 쓸 것.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
