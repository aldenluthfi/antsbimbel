import { toast } from "sonner"

import { parseApiError } from "@/lib/api"

export function notifySubmitError(error: unknown, title = "Submit failed") {
  toast.error(title, { description: parseApiError(error) })
}
