import { useEffect, useState } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<ToasterProps["theme"]>("system")

  useEffect(() => {
    const root = document.documentElement

    const updateTheme = () => {
      if (root.classList.contains("dark")) {
        setTheme("dark")
        return
      }

      if (root.classList.contains("light")) {
        setTheme("light")
        return
      }

      setTheme("system")
    }

    updateTheme()
    const observer = new MutationObserver(updateTheme)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })

    return () => observer.disconnect()
  }, [])

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast rounded-xl border border-border/70 bg-background/95 text-foreground shadow-[0_12px_36px_-14px_rgba(0,0,0,0.45)] backdrop-blur supports-[backdrop-filter]:bg-background/80",
          title: "text-sm font-semibold tracking-tight",
          description: "text-sm text-muted-foreground",
          closeButton:
            "rounded-full border border-border/60 bg-background/90 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          actionButton:
            "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
          cancelButton:
            "rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/80",
          success: "border-emerald-500/35 bg-emerald-950/90 text-emerald-50",
          error: "border-rose-500/35 bg-rose-950/90 text-rose-50",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
