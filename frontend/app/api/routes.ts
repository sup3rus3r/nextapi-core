
import { platform } from "@/lib/platform"
import { BACKEND_URL } from "@/lib/mobile-auth"

// Web routes through the Next.js rewrite (/api/backend/* -> FastAPI).
// Native has no Next.js server, so it must call FastAPI directly.
const base = () => (platform.isNative ? BACKEND_URL : "/api/backend")

export const AppRoutes = {
    GetHealth           : () => `${base()}/health`,
    GetUserDetails      : () => `${base()}/get_user_details`,
    ToggleRole          : () => `${base()}/user/toggle-role`
}