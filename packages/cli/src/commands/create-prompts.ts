import * as prompts from "@clack/prompts";
import pc from "picocolors";
import { FLARE_VERSION } from "@flaredev/core";
import { AUTH_METHODS, AUTH_PROVIDERS, DEFAULT_AUTH_METHODS, type AuthMethod, type AuthProvider } from "../auth-providers.js";
import { THEMES, type ThemeName } from "../themes.js";

export interface CreateAnswers {
  theme?: string;
  auth?: string;
  authProviders?: string;
}

/** Whether `flare create` may ask questions: a real terminal, and not told to skip them. */
export const canPrompt = (yes: boolean | undefined) => !yes && Boolean(process.stdin.isTTY && process.stdout.isTTY);

/**
 * Short labels, long hints: the label is what stays on screen after the answer, so a
 * sentence there wraps over four lines and buries the rest of the questions.
 */
const AUTH_HINTS: Record<AuthMethod, string> = {
  "magic-link": "a sign-in link by email",
  "email-otp": "a 6-digit sign-in code by email",
  passkeys: "Face ID, Touch ID, Windows Hello",
  "2fa-app": "authenticator app, with backup codes",
  "2fa-email": "a code by email as the second step",
};

const AUTH_LABELS: Record<AuthMethod, string> = {
  "magic-link": "Magic links",
  "email-otp": "Email codes",
  passkeys: "Passkeys",
  "2fa-app": "Two-factor: authenticator app",
  "2fa-email": "Two-factor: email code",
};

function stopIfCancelled<T>(value: T): Exclude<T, symbol> {
  if (prompts.isCancel(value)) {
    prompts.cancel("Cancelled: nothing was created.");
    process.exit(1);
  }
  return value as Exclude<T, symbol>;
}

/**
 * Ask for the theme, the sign-in methods and the social providers, skipping any the
 * command line already answered (`--theme`, `--auth`, `--auth-providers`).
 */
export async function askCreateQuestions(given: CreateAnswers, appName?: string): Promise<CreateAnswers> {
  prompts.intro(`${pc.bgRed(pc.white(" Flare "))} ${pc.dim(`v${FLARE_VERSION}`)}${appName ? ` ${pc.dim("·")} ${pc.bold(appName)}` : ""}`);
  const answers = { ...given };

  if (given.theme === undefined) {
    answers.theme = stopIfCancelled(
      await prompts.select<ThemeName>({
        message: "Pick a look",
        initialValue: "default",
        options: Object.entries(THEMES).map(([value, hint]) => ({ value: value as ThemeName, label: value, hint })),
      }),
    );
  }

  if (given.auth === undefined) {
    const methods = stopIfCancelled(
      await prompts.multiselect<AuthMethod>({
        message: `How can people sign in? ${pc.dim("Email and password is always on")}`,
        initialValues: DEFAULT_AUTH_METHODS,
        required: false,
        options: Object.keys(AUTH_METHODS).map((value) => ({
          value: value as AuthMethod,
          label: AUTH_LABELS[value as AuthMethod],
          hint: AUTH_HINTS[value as AuthMethod],
        })),
      }),
    );
    answers.auth = methods.length ? methods.join(",") : "none";
  }

  if (given.authProviders === undefined) {
    const providers = stopIfCancelled(
      await prompts.multiselect<AuthProvider>({
        message: `Social sign-in? ${pc.dim("each needs its own credentials later")}`,
        initialValues: [],
        required: false,
        options: Object.entries(AUTH_PROVIDERS).map(([value, { label }]) => ({ value: value as AuthProvider, label })),
      }),
    );
    answers.authProviders = providers.join(",");
  }

  return answers;
}
