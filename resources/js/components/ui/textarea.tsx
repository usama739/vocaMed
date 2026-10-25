import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-subtle flex min-h-24 w-full resize-y rounded-md border bg-background px-3.5 py-3 text-body text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
