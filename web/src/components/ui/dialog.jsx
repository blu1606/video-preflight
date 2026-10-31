import { XIcon } from "lucide-react"
import { cn } from "cn"
import { Dialog as DialogPrimitive } from "radix-ui"

function Dialog(props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-base font-semibold", className)} {...props} />
}

function DialogDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

// Large dialog in the style of mockup-v2 `.deep-dialog`: blurred scrim, canvas body, sticky header slot.
function DialogContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="fixed inset-0 z-50 bg-[rgba(33,33,33,.36)] backdrop-blur-[6px] data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-32px)] w-[min(1240px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-page shadow-pop outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Đóng"
        >
          <XIcon className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export { Dialog, DialogContent, DialogDescription, DialogTitle }
