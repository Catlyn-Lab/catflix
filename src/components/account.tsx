/** The account button in the top bar, and the sign-in screen the desktop app opens on. */

import { A } from "@solidjs/router";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import {
  account,
  accountStatus,
  canSignIn,
  cancelSignIn,
  loadAccount,
  signIn,
  signingIn,
  signOut,
  type User,
} from "../lib/account";
import { LANGUAGES, language, setLanguage, t, type Language } from "../lib/i18n";
import { Cat, Check, Globe, State } from "./ui";

/** Google's "G", drawn here: Catflix loads nothing from Google's servers. */
export const GoogleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" class="google-mark">
    <path
      fill="#4285F4"
      d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.2 3.5-8.8Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"
    />
    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
    <path
      fill="#EA4335"
      d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"
    />
  </svg>
);

const initials = (name?: string | null) =>
  (name ?? "?")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const PersonIcon = () => (
  <svg viewBox="0 0 24 24" class="person-icon" aria-hidden="true">
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6" />
  </svg>
);

const SignInIcon = () => (
  <svg viewBox="0 0 24 24" class="menu-icon" aria-hidden="true">
    <path d="M10 4h7.5A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5H10" />
    <path d="M4 12h10M10.5 8.5 14 12l-3.5 3.5" />
  </svg>
);

const Chevron = () => (
  <svg viewBox="0 0 24 24" class="chevron" aria-hidden="true">
    <path d="m7 10 5 5 5-5" />
  </svg>
);

/** Small flags for the language choice. */
const Flag = (props: { id: Language }) =>
  props.id === "id" ? (
    <svg viewBox="0 0 30 20" class="flag" aria-hidden="true">
      <rect width="30" height="10" fill="#e70011" />
      <rect y="10" width="30" height="10" fill="#fff" />
    </svg>
  ) : (
    <svg viewBox="0 0 30 20" class="flag" aria-hidden="true">
      <rect width="30" height="20" fill="#fff" />
      <path
        d="M0 0h30v1.54H0zm0 3.08h30v1.54H0zm0 3.08h30v1.54H0zm0 3.08h30v1.54H0zm0 3.08h30v1.54H0zm0 3.08h30v1.54H0zm0 3.08h30V20H0z"
        fill="#b22234"
      />
      <rect width="13" height="10.77" fill="#3c3b6e" />
    </svg>
  );

const Avatar = (props: { user: User | null }) => (
  <span class="account-avatar">
    <Show when={props.user} fallback={<PersonIcon />}>
      {(user) => (
        <Show when={user().avatar} fallback={<span>{initials(user().name)}</span>}>
          <img src={user().avatar!} alt="" referrerpolicy="no-referrer" />
        </Show>
      )}
    </Show>
  </span>
);

/** "Account" in the top bar: sign in / sign up, history and the language, in one menu. */
export function AccountButton() {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;

  onMount(() => {
    const close = (event: Event) => {
      if (!root.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    });
  });

  const join = () => {
    setOpen(false);
    void signIn();
  };

  return (
    <div class="account" ref={root}>
      <button
        class="account-btn"
        aria-haspopup="menu"
        aria-expanded={open()}
        data-open={open() || undefined}
        onClick={() => setOpen(!open())}
      >
        <Avatar user={account()} />
        <span class="account-label">{t("account.menu")}</span>
        <Chevron />
      </button>

      <Show when={open()}>
        <div class="account-menu" role="menu" aria-label={t("account.menu")}>
          <div class="account-card">
            <Avatar user={account()} />
            <p>
              <strong>{account()?.name ?? t("account.menu")}</strong>
              <small>{account()?.email ?? t("account.guestHint")}</small>
            </p>
          </div>

          <Show
            when={account()}
            fallback={
              <>
                <div class="account-actions">
                  <button role="menuitem" disabled={!canSignIn()} onClick={join}>
                    <SignInIcon />
                    {t("account.signIn")}
                  </button>
                  <button role="menuitem" data-primary disabled={!canSignIn()} onClick={join}>
                    <PersonIcon />
                    {t("account.signUp")}
                  </button>
                </div>
                <Show when={!canSignIn()}>
                  <p class="account-note">{t("account.notSetUp")}</p>
                </Show>
              </>
            }
          >
            <A class="account-row" href="/history" role="menuitem" onClick={() => setOpen(false)}>
              {t("account.history")}
            </A>
            <button
              class="account-row"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
            >
              {t("account.signOut")}
            </button>
          </Show>

          <div class="account-language">
            <p class="account-section">
              <Globe />
              {t("nav.language")}
            </p>
            <div class="account-languages">
              <For each={[...LANGUAGES].reverse()}>
                {(entry) => (
                  <button
                    role="menuitemradio"
                    aria-checked={language() === entry.id}
                    data-active={language() === entry.id || undefined}
                    lang={entry.id}
                    onClick={() => setLanguage(entry.id)}
                  >
                    <Flag id={entry.id} />
                    <span>{entry.id === "id" ? "Bahasa" : entry.name}</span>
                    <Show when={language() === entry.id}>
                      <Check />
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

/** The desktop app's first screen until the viewer has signed in. */
export function SignInGate() {
  let button: HTMLButtonElement | undefined;
  onMount(() => button?.focus());

  return (
    <div class="dialog-scrim gate">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="gate-title">
        <Cat class="dialog-mark" />
        <Show
          when={accountStatus() !== "offline"}
          fallback={
            <>
              <h2 id="gate-title">{t("account.offline")}</h2>
              <p>{t("account.offlineHint")}</p>
              <button class="btn btn-primary" ref={button} onClick={() => void loadAccount()}>
                {t("common.retry")}
              </button>
            </>
          }
        >
          <h2 id="gate-title">{t("account.gateTitle")}</h2>
          <p>{t("account.gateText")}</p>
          <Show when={canSignIn()} fallback={<p class="dialog-note">{t("account.notSetUp")}</p>}>
            <Show
              when={!signingIn()}
              fallback={
                <>
                  <State spinner>{t("account.waiting")}</State>
                  <button class="btn btn-ghost" onClick={cancelSignIn}>
                    {t("account.cancel")}
                  </button>
                </>
              }
            >
              <button class="btn btn-primary google-btn" ref={button} onClick={() => void signIn()}>
                <GoogleMark />
                {t("account.signInGoogle")}
              </button>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
}
