import type { SocialProvider } from "@/lib/auth-config";

/** Provider marks for the social sign-in buttons (brand colours, as each provider's guidelines ask). */
export function ProviderIcon({ provider, className = "size-5" }: { provider: SocialProvider; className?: string }) {
  switch (provider) {
    case "google":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84Z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.97 10.97 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
        </svg>
      );
    case "github":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.17c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
        </svg>
      );
    case "apple":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path fill="currentColor" d="M16.37 12.64c-.03-2.6 2.13-3.86 2.23-3.92-1.22-1.78-3.11-2.02-3.78-2.05-1.6-.17-3.13.95-3.95.95-.82 0-2.07-.93-3.4-.9a5.03 5.03 0 0 0-4.25 2.58c-1.83 3.17-.47 7.84 1.3 10.4.87 1.25 1.9 2.66 3.25 2.61 1.3-.05 1.8-.84 3.38-.84 1.57 0 2.02.84 3.4.81 1.4-.02 2.29-1.27 3.15-2.53a11 11 0 0 0 1.42-2.93 4.55 4.55 0 0 1-2.75-4.18ZM13.8 5.02c.72-.88 1.2-2.09 1.07-3.3-1.04.04-2.3.69-3.04 1.56-.66.77-1.25 2.01-1.09 3.19 1.15.09 2.33-.59 3.06-1.45Z" />
        </svg>
      );
    case "microsoft":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
          <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
          <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
          <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
        </svg>
      );
  }
}

export const PROVIDER_LABELS: Record<SocialProvider, string> = { google: "Google", github: "GitHub", apple: "Apple", microsoft: "Microsoft" };
