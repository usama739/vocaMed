import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

// VocaMed: every size is at least 44px tall (front-desk tap targets). The focus ring is
// global (see app.css), so no focus utilities here.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-control font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-[18px] [&_svg]:shrink-0 aria-invalid:border-danger",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-btn hover:-translate-y-px hover:bg-brand-hover hover:shadow-glow active:translate-y-0 active:shadow-none",
        destructive: "bg-danger text-white hover:bg-danger-ink",
        outline:
          "border border-line-strong bg-background text-ink shadow-xs hover:bg-surface-hover",
        "outline-destructive":
          "border border-line-strong bg-background text-danger-ink hover:bg-surface-hover",
        secondary: "bg-secondary text-secondary-foreground hover:bg-line-soft",
        ghost: "text-ink hover:bg-surface-hover",
        link: "text-brand-hover underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 px-5 has-[>svg]:px-4",
        sm: "h-11 px-4 has-[>svg]:px-3.5",
        lg: "h-[52px] px-6 text-body has-[>svg]:px-5",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
