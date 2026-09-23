"use client";

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toasts in the app's theme.
 *
 * The colours come from the theme tokens (app/globals.css), so success is the theme's
 * green, an error is its red, and the corner radius matches everything else — switch
 * the theme and the toasts switch with it. Light or dark comes from the dashboard
 * layout's cookie, so there's no theme provider in the tree.
 */
const Toaster = ({ theme = "system", ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          // A tinted left edge and a matching icon: the tone reads at a glance without
          // colouring the whole toast, which would fight the page behind it.
          toast:
            "group toast border-l-4 shadow-lg data-[type=success]:border-l-success data-[type=error]:border-l-danger data-[type=warning]:border-l-warning data-[type=info]:border-l-link",
          icon: "group-data-[type=success]:text-success group-data-[type=error]:text-danger group-data-[type=warning]:text-warning group-data-[type=info]:text-link",
          title: "text-sm font-medium",
          description: "text-xs text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-muted-foreground",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--success-bg": "var(--popover)",
          "--success-text": "var(--popover-foreground)",
          "--error-bg": "var(--popover)",
          "--error-text": "var(--popover-foreground)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
