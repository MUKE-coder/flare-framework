import * as prompts from "@clack/prompts";
import { AUTH_METHODS, AUTH_PROVIDERS, DEFAULT_AUTH_METHODS, type AuthMethod, type AuthProvider } from "../auth-providers.js";
import { THEMES, type ThemeName } from "../themes.js";

export interface CreateAnswers {
  theme?: string;
  auth?: string;
  authProviders?: string;
}

/** Whether `flare create` may ask questions: a real terminal, and not told to skip them. */
export const canPrompt = (yes: boolean | undefined) => !yes && Boolean(process.stdin.isTTY && process.stdout.isTTY);

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
export async function askCreateQuestions(given: CreateAnswers): Promise<CreateAnswers> {
  prompts.intro("Let's set up your Flare app");
  const answers = { ...given };

  if (given.theme === undefined) {
    answers.theme = stopIfCancelled(
      await prompts.select<ThemeName>({
        message: "Pick a look (change it later in lib/site.ts or with FLARE_THEME)",
        initialValue: "default",
        options: Object.entries(THEMES).map(([value, hint]) => ({ value: value as ThemeName, label: value, hint })),
      }),
    );
  }

  if (given.auth === undefined) {
    const methods = stopIfCancelled(
      await prompts.multiselect<AuthMethod>({
        message: "How can people sign in? Email and password is always on. (space to toggle)",
        initialValues: DEFAULT_AUTH_METHODS,
        required: false,
        options: Object.entries(AUTH_METHODS).map(([value, label]) => ({ value: value as AuthMethod, label })),
      }),
    );
    answers.auth = methods.length ? methods.join(",") : "none";
  }

  if (given.authProviders === undefined) {
    const providers = stopIfCancelled(
      await prompts.multiselect<AuthProvider>({
        message: "Social sign-in? Each needs its own credentials later. (space to toggle, enter to skip)",
        initialValues: [],
        required: false,
        options: Object.entries(AUTH_PROVIDERS).map(([value, { label }]) => ({ value: value as AuthProvider, label })),
      }),
    );
    answers.authProviders = providers.join(",");
  }

  prompts.outro("Creating your app");
  return answers;
}
