import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input file:text-foreground placeholder:text-subtle selection:bg-primary selection:text-primary-foreground flex h-12 w-full min-w-0 rounded-md border bg-background px-3.5 py-1 text-body text-ink transition-colors file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
