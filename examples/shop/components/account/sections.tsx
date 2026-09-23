"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { renderSVG } from "uqr";
import { CheckIcon, CopyIcon, FingerprintIcon, LaptopIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { AuthInput, AuthLabel, FormMessage, PrimaryButton, SecondaryButton, TextButton } from "@/components/auth/ui";
import { PasswordField } from "@/components/auth/password-field";
import { authErrorMessage } from "@/components/auth/sign-in-flow";
import { PROVIDER_LABELS, ProviderIcon } from "@/components/auth/provider-icons";
import { authClient } from "@/lib/auth-client";
import { checkPassword } from "@/lib/password-rules";
import type { SocialProvider } from "@/lib/auth-config";
import { cn } from "@/lib/utils";

interface Props {
  user: { name: string; email: string; emailVerified: boolean; twoFactorEnabled: boolean };
  hasPassword: boolean;
  methods: { passkeys: boolean; twoFactor: { authenticator: boolean; email: boolean } };
  socialProviders: SocialProvider[];
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8 rounded-[calc(var(--radius)+4px)] border border-border bg-surface">
      <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-10">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className="text-base">
            {title}
          </h2>
          <p className="text-sm text-foreground-muted">{description}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </div>
    </section>
  );
}

function Badge({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", on ? "bg-success/10 text-success" : "bg-surface-muted text-foreground-muted")}>
      {on && <CheckIcon className="size-3.5" />}
      {children}
    </span>
  );
}

/** A password box for the actions that must confirm it's really you. */
function PasswordConfirm({ value, onChange, id }: { value: string; onChange: (value: string) => void; id: string }) {
  return (
    <div className="flex flex-col gap-2">
      <AuthLabel htmlFor={id}>Your password</AuthLabel>
      <AuthInput id={id} type="password" autoComplete="current-password" value={value} onChange={(event) => onChange(event.target.value)} required />
    </div>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface-muted p-4">
      <p className="text-sm font-medium">Save these backup codes somewhere safe</p>
      <p className="text-sm text-foreground-muted">Each one signs you in once if you lose your authenticator. You won&apos;t see them again.</p>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <SecondaryButton
        className="w-fit"
        onClick={async () => {
          await navigator.clipboard.writeText(codes.join("\n"));
          setCopied(true);
        }}
      >
        {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        {copied ? "Copied" : "Copy codes"}
      </SecondaryButton>
    </div>
  );
}

export function Profile({ user }: { user: Props["user"] }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending("name");
    const { error } = await authClient.updateUser({ name });
    setPending(null);
    setMessage(error ? { tone: "error", text: authErrorMessage(error) } : { tone: "success", text: "Saved." });
    if (!error) router.refresh();
  };

  const verify = async () => {
    setPending("verify");
    const { error } = await authClient.sendVerificationEmail({ email: user.email, callbackURL: "/dashboard/account" });
    setPending(null);
    setMessage(error ? { tone: "error", text: authErrorMessage(error) } : { tone: "success", text: `We sent a verification link to ${user.email}.` });
  };

  return (
    <Section id="profile" title="Profile" description="Your name and the email you sign in with.">
      <form className="flex flex-col gap-4" onSubmit={save}>
        <div className="flex flex-col gap-2">
          <AuthLabel htmlFor="profile-name">Name</AuthLabel>
          <AuthInput id="profile-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Email</span>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{user.email}</span>
            <Badge on={user.emailVerified}>{user.emailVerified ? "Verified" : "Not verified"}</Badge>
            {!user.emailVerified && (
              <TextButton onClick={verify} disabled={pending !== null}>
                Send verification link
              </TextButton>
            )}
          </div>
        </div>
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <PrimaryButton type="submit" pending={pending === "name"} className="w-fit" disabled={name === user.name}>
          Save
        </PrimaryButton>
      </form>
    </Section>
  );
}

export function Password({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  if (!hasPassword) {
    return (
      <Section id="password" title="Password" description="You sign in with a social account or passkey, so you have no password yet.">
        <p className="text-sm text-foreground-muted">Set one to also sign in with your email and password.</p>
        <a href={`/forgot-password?email=${encodeURIComponent(email)}`} className="w-fit text-sm font-medium text-link hover:underline">
          Set a password
        </a>
      </Section>
    );
  }

  const change = async (event: React.FormEvent) => {
    event.preventDefault();
    const check = checkPassword(next, [email]);
    if (!check.valid) return setMessage({ tone: "error", text: check.advice ?? "That password is too short." });
    setPending(true);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setPending(false);
    if (error) return setMessage({ tone: "error", text: error.code === "INVALID_PASSWORD" ? "Your current password isn't right." : authErrorMessage(error) });
    setCurrent("");
    setNext("");
    setMessage({ tone: "success", text: "Password changed. Your other devices were signed out." });
  };

  return (
    <Section id="password" title="Password" description="Changing it signs you out everywhere else.">
      <form className="flex flex-col gap-4" onSubmit={change}>
        <PasswordField id="current-password" label="Current password" name="current-password" autoComplete="current-password" value={current} onChange={setCurrent} showRules={false} />
        <PasswordField id="new-password" label="New password" name="new-password" value={next} onChange={setNext} avoid={[email]} />
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <PrimaryButton type="submit" pending={pending} className="w-fit">
          Change password
        </PrimaryButton>
      </form>
    </Section>
  );
}

export function TwoFactor({ enabled, hasPassword, methods }: { enabled: boolean; hasPassword: boolean; methods: Props["methods"]["twoFactor"] }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"idle" | "confirm-app" | "confirm-email" | "scan" | "disable" | "regenerate">("idle");
  const [setup, setSetup] = useState<{ uri: string; codes: string[] } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordBody = hasPassword ? { password } : {};

  const reset = () => {
    setStage("idle");
    setPassword("");
    setCode("");
    setError(null);
  };

  const run = async (work: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await work();
    } finally {
      setPending(false);
    }
  };

  const startApp = () =>
    run(async () => {
      const { data, error } = await authClient.twoFactor.enable({ ...passwordBody, method: "totp" } as never);
      if (error) return setError(error.code === "INVALID_PASSWORD" ? "That password isn't right." : authErrorMessage(error));
      const result = data as { totpURI: string; backupCodes: string[] };
      setSetup({ uri: result.totpURI, codes: result.backupCodes });
      setStage("scan");
    });

  const confirmApp = () =>
    run(async () => {
      const { error } = await authClient.twoFactor.verifyTotp({ code: code.trim() });
      if (error) return setError(authErrorMessage(error));
      setCodes(setup?.codes ?? null);
      reset();
      router.refresh();
    });

  const startEmail = () =>
    run(async () => {
      const { error } = await authClient.twoFactor.enable({ ...passwordBody, method: "otp" } as never);
      if (error) return setError(error.code === "INVALID_PASSWORD" ? "That password isn't right." : authErrorMessage(error));
      reset();
      router.refresh();
    });

  const disable = () =>
    run(async () => {
      const { error } = await authClient.twoFactor.disable(passwordBody as never);
      if (error) return setError(error.code === "INVALID_PASSWORD" ? "That password isn't right." : authErrorMessage(error));
      setCodes(null);
      reset();
      router.refresh();
    });

  const regenerate = () =>
    run(async () => {
      const { data, error } = await authClient.twoFactor.generateBackupCodes(passwordBody as never);
      if (error) return setError(error.code === "INVALID_PASSWORD" ? "That password isn't right." : authErrorMessage(error));
      setCodes((data as { backupCodes: string[] }).backupCodes);
      reset();
    });

  const confirmForm = (action: () => void, label: string) => (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        action();
      }}
    >
      {hasPassword && <PasswordConfirm id="two-factor-password" value={password} onChange={setPassword} />}
      <FormMessage>{error}</FormMessage>
      <div className="flex gap-3">
        <PrimaryButton type="submit" pending={pending} className="w-fit">
          {label}
        </PrimaryButton>
        <SecondaryButton onClick={reset} className="w-fit">
          Cancel
        </SecondaryButton>
      </div>
    </form>
  );

  return (
    <Section id="two-factor" title="Two-factor authentication" description="A second step after your password, so a stolen password isn't enough.">
      <Badge on={enabled}>{enabled ? "On" : "Off"}</Badge>
      {codes && <BackupCodes codes={codes} />}

      {stage === "scan" && setup && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            confirmApp();
          }}
        >
          <p className="text-sm">Scan this with your authenticator app (1Password, Google Authenticator, Authy…), then enter the 6-digit code it shows.</p>
          <div className="w-44 rounded-[var(--radius)] border border-border bg-white p-3 [&_svg]:h-auto [&_svg]:w-full" aria-label="QR code for your authenticator app" role="img" dangerouslySetInnerHTML={{ __html: renderSVG(setup.uri) }} />
          <details className="text-sm text-foreground-muted">
            <summary className="cursor-pointer">Can&apos;t scan it?</summary>
            <p className="mt-2 break-all font-mono text-xs">{new URL(setup.uri).searchParams.get("secret")}</p>
          </details>
          <div className="flex flex-col gap-2">
            <AuthLabel htmlFor="totp-code">Code</AuthLabel>
            <AuthInput id="totp-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" className="w-40 font-mono tracking-widest" required />
          </div>
          <FormMessage>{error}</FormMessage>
          <div className="flex gap-3">
            <PrimaryButton type="submit" pending={pending} className="w-fit">
              Turn on
            </PrimaryButton>
            <SecondaryButton onClick={reset} className="w-fit">
              Cancel
            </SecondaryButton>
          </div>
        </form>
      )}
      {stage === "confirm-app" && confirmForm(startApp, "Continue")}
      {stage === "confirm-email" && confirmForm(startEmail, "Turn on email codes")}
      {stage === "disable" && confirmForm(disable, "Turn off two-factor")}
      {stage === "regenerate" && confirmForm(regenerate, "Show new codes")}

      {stage === "idle" && !enabled && (
        <div className="flex flex-wrap gap-3">
          {methods.authenticator && (
            <PrimaryButton className="w-fit" onClick={() => setStage("confirm-app")}>
              <ShieldCheckIcon className="size-4" /> Set up an authenticator app
            </PrimaryButton>
          )}
          {methods.email && (
            <SecondaryButton className="w-fit" onClick={() => setStage("confirm-email")}>
              Use codes by email
            </SecondaryButton>
          )}
        </div>
      )}
      {stage === "idle" && enabled && (
        <div className="flex flex-wrap gap-3">
          {methods.authenticator && (
            <SecondaryButton className="w-fit" onClick={() => setStage("regenerate")}>
              New backup codes
            </SecondaryButton>
          )}
          <SecondaryButton className="w-fit text-danger" onClick={() => setStage("disable")}>
            Turn off
          </SecondaryButton>
        </div>
      )}
    </Section>
  );
}

interface PasskeyRow {
  id: string;
  name?: string | null;
  createdAt?: string | Date | null;
}

export function Passkeys() {
  const [list, setList] = useState<PasskeyRow[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await authClient.passkey.listUserPasskeys();
    setList((data as PasskeyRow[] | null) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setPending(true);
    setError(null);
    const device = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "Apple device" : /Android/.test(navigator.userAgent) ? "Android device" : /Windows/.test(navigator.userAgent) ? "Windows device" : "This device";
    const result = await authClient.passkey.addPasskey({ name: device });
    setPending(false);
    if (result?.error) return setError(authErrorMessage(result.error, "The passkey wasn't saved. Try again."));
    await load();
  };

  const remove = async (id: string) => {
    const { error } = await authClient.passkey.deletePasskey({ id });
    if (error) return setError(authErrorMessage(error));
    await load();
  };

  return (
    <Section id="passkeys" title="Passkeys" description="Sign in with Face ID, Touch ID, Windows Hello or a security key: no password to type or steal.">
      {list && list.length > 0 && (
        <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
          {list.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <FingerprintIcon className="size-4 text-foreground-muted" />
              <span className="flex-1">
                <span className="font-medium">{item.name || "Passkey"}</span>
                {item.createdAt && <span className="block text-xs text-foreground-muted">Added {new Date(item.createdAt).toLocaleDateString()}</span>}
              </span>
              <button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.name || "passkey"}`} className="rounded-md p-1.5 text-foreground-muted hover:bg-surface-muted hover:text-danger">
                <Trash2Icon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {list && list.length === 0 && <p className="text-sm text-foreground-muted">No passkeys yet.</p>}
      <FormMessage>{error}</FormMessage>
      <PrimaryButton className="w-fit" onClick={add} pending={pending}>
        <FingerprintIcon className="size-4" /> Add a passkey
      </PrimaryButton>
    </Section>
  );
}

export function ConnectedAccounts({ providers }: { providers: SocialProvider[] }) {
  const [linked, setLinked] = useState<{ providerId: string; accountId: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await authClient.listAccounts();
    setLinked((data as { providerId: string; accountId: string }[] | null) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const connect = async (provider: SocialProvider) => {
    const { error } = await authClient.linkSocial({ provider, callbackURL: "/dashboard/account" });
    if (error) setError(authErrorMessage(error));
  };
  const disconnect = async (provider: SocialProvider) => {
    const row = linked?.find((item) => item.providerId === provider);
    if (!row) return;
    const { error } = await authClient.unlinkAccount({ accountId: row.accountId });
    if (error) return setError(error.code === "FAILED_TO_UNLINK_LAST_ACCOUNT" ? "Add a password or another sign-in method before disconnecting your only one." : authErrorMessage(error));
    await load();
  };

  return (
    <Section id="connected" title="Connected accounts" description="Social accounts you can sign in with.">
      <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
        {providers.map((provider) => {
          const on = linked?.some((item) => item.providerId === provider) ?? false;
          return (
            <li key={provider} className="flex items-center gap-3 px-4 py-3 text-sm">
              <ProviderIcon provider={provider} />
              <span className="flex-1 font-medium">{PROVIDER_LABELS[provider]}</span>
              {linked === null ? null : on ? (
                <TextButton onClick={() => disconnect(provider)}>Disconnect</TextButton>
              ) : (
                <TextButton onClick={() => connect(provider)}>Connect</TextButton>
              )}
            </li>
          );
        })}
      </ul>
      <FormMessage>{error}</FormMessage>
    </Section>
  );
}

interface SessionRow {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  updatedAt?: string | Date;
}

function describeDevice(agent?: string | null): string {
  if (!agent) return "Unknown device";
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const system = /Windows/.test(agent) ? "Windows" : /Mac OS X/.test(agent) ? "macOS" : /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Linux/.test(agent) ? "Linux" : "";
  return system ? `${browser} on ${system}` : browser;
}

export function Sessions() {
  const [list, setList] = useState<SessionRow[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data }, session] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
    setList((data as SessionRow[] | null) ?? []);
    setCurrent(session.data?.session.token ?? null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const signOutOthers = async () => {
    await authClient.revokeOtherSessions();
    setMessage("Signed out of every other device.");
    await load();
  };

  return (
    <Section id="sessions" title="Where you're signed in" description="Sign out of devices you don't recognise.">
      <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
        {(list ?? []).map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <LaptopIcon className="size-4 text-foreground-muted" />
            <span className="flex-1">
              <span className="font-medium">{describeDevice(item.userAgent)}</span>
              <span className="block text-xs text-foreground-muted">
                {item.ipAddress || "Unknown location"}
                {item.updatedAt && `, last active ${new Date(item.updatedAt).toLocaleString()}`}
              </span>
            </span>
            {item.token === current && <Badge on>This device</Badge>}
          </li>
        ))}
      </ul>
      {message && <FormMessage tone="success">{message}</FormMessage>}
      {list && list.length > 1 && (
        <SecondaryButton className="w-fit" onClick={signOutOthers}>
          Sign out of other devices
        </SecondaryButton>
      )}
    </Section>
  );
}
