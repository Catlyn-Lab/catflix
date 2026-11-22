/** "Create subtitle": pick a source subtitle, a language, the translator or AI (with a tone). */

import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import type { Subtitle } from "../lib/api";
import { account, canSignIn, signIn } from "../lib/account";
import { language, t, type Phrase } from "../lib/i18n";
import { createSubtitle, subtitleOptions, type Generated, type Tone } from "../lib/subtitles";

const TONE_LABEL: Record<Tone, Phrase> = {
  formal: "tone.formal",
  neutral: "tone.neutral",
  casual: "tone.casual",
  kids: "tone.kids",
  custom: "tone.custom",
};

export default function SubtitleMaker(props: {
  /** The title's own subtitles (generated ones are not offered as a source). */
  sources: Subtitle[];
  /** Every subtitle the title has now, its own and generated: their languages can't be made again. */
  all: Subtitle[];
  sourceName: (entry: Subtitle) => string;
  onCreated: (entry: Generated) => void;
  onBack: () => void;
}) {
  const [options] = createResource(
    () => ({ viewer: account()?.id ?? 0 }),
    () => subtitleOptions(),
  );
  const english = Math.max(
    0,
    props.sources.findIndex((entry) =>
      /^(en|eng)\b|english/i.test(`${entry.lang ?? ""} ${entry.label ?? ""}`),
    ),
  );
  const [source, setSource] = createSignal(english);
  const [method, setMethod] = createSignal<"translate" | "ai">("translate");
  const [tone, setTone] = createSignal<Tone>("casual");

  /** A subtitle (the title's own) is in this language. */
  const inLanguage = (entry: Subtitle, code: string, name: string) => {
    const base = code.toLowerCase().split("-")[0];
    const lang = (entry.lang ?? "").toLowerCase();
    return (
      lang === code.toLowerCase() ||
      lang.split(/[-_]/)[0] === base ||
      new RegExp(`\\b${name.split(" ")[0]}\\b`, "i").test(entry.label ?? "")
    );
  };
  /** The title has this language already, its own or made by anyone. */
  const has = (code: string, name: string) =>
    props.all.some((entry) => (entry.generated ? entry.lang === code : inLanguage(entry, code, name)));
  /** This viewer already made one in this language this way (and, for AI, in this tone). */
  const mineMade = (code: string, how: "translate" | "ai", withTone?: Tone) =>
    props.all.some(
      (entry) =>
        entry.generated?.mine &&
        entry.lang === code &&
        entry.generated.method === how &&
        (how === "translate" || entry.generated.tone === withTone),
    );
  /** The language of the subtitle being translated from. */
  const sameAsSource = (code: string, name: string) => {
    const chosen = props.sources[source()];
    return Boolean(chosen && inLanguage(chosen, code, name));
  };
  /**
   * Each viewer (guests together) makes one translator subtitle per language and one AI subtitle
   * per language and tone, even where the title already has that language from someone else.
   */
  const taken = (code: string, name: string) =>
    sameAsSource(code, name) || (method() === "translate" && mineMade(code, "translate"));
  const takenLabel = (code: string, name: string) =>
    sameAsSource(code, name)
      ? t("maker.sameAsSource", { language: name })
      : t("maker.youMade", { language: name });
  const toneTaken = (entry: Tone) => entry !== "custom" && mineMade(target(), "ai", entry);

  const free = () => (options()?.languages ?? []).filter((entry) => !taken(entry.code, entry.name));
  const [target, setTarget] = createSignal("");
  // Start on a language the title lacks (the viewer's own first), else the viewer's own language.
  createEffect(() => {
    const open = free();
    if (open.some((entry) => entry.code === target())) return;
    const mine = language() === "id" ? "id" : "en";
    const missing = open.filter((entry) => !has(entry.code, entry.name));
    setTarget(
      (
        missing.find((entry) => entry.code === mine) ??
        open.find((entry) => entry.code === mine) ??
        missing[0] ??
        open[0]
      )?.code ?? "",
    );
  });
  // Move off a tone that already exists for the chosen language.
  createEffect(() => {
    if (method() !== "ai" || !toneTaken(tone())) return;
    setTone((options()?.tones ?? []).find((entry) => !toneTaken(entry)) ?? "custom");
  });
  const [custom, setCustom] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  /** AI needs the server to have a model, and a signed-in viewer (clicking then signs in). */
  const aiHint = () =>
    !options()?.ai ? t("maker.aiUnavailable") : !account() ? t("maker.aiSignIn") : t("maker.aiHint");
  const pickAi = () => {
    if (account()) setMethod("ai");
    else if (canSignIn()) void signIn();
  };

  const create = async () => {
    const chosen = props.sources[source()];
    if (!chosen) return;
    setBusy(true);
    setError("");
    try {
      const made = await createSubtitle({
        sourceUrl: chosen.source ?? chosen.url,
        sourceLabel: props.sourceName(chosen),
        targetLang: target(),
        titleSources: props.all.map((entry) => entry.source ?? entry.url),
        method: method(),
        tone: method() === "ai" ? tone() : undefined,
        customTone: method() === "ai" && tone() === "custom" ? custom() : undefined,
      });
      props.onCreated(made);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="maker">
      <h3>{t("maker.title")}</h3>

      <label class="maker-field">
        <span>{t("maker.from")}</span>
        <select value={source()} onChange={(event) => setSource(Number(event.currentTarget.value))}>
          <For each={props.sources}>
            {(entry, index) => <option value={index()}>{props.sourceName(entry)}</option>}
          </For>
        </select>
      </label>

      <label class="maker-field">
        <span>{t("maker.into")}</span>
        <select value={target()} onChange={(event) => setTarget(event.currentTarget.value)}>
          <For each={options()?.languages ?? []}>
            {(entry) => (
              <option
                value={entry.code}
                selected={entry.code === target()}
                disabled={taken(entry.code, entry.name)}
              >
                {taken(entry.code, entry.name) ? takenLabel(entry.code, entry.name) : entry.name}
              </option>
            )}
          </For>
        </select>
      </label>

      <div class="maker-field" role="radiogroup" aria-label={t("maker.how")}>
        <span>{t("maker.how")}</span>
        <div class="maker-choices">
          <button
            role="radio"
            aria-checked={method() === "translate"}
            data-active={method() === "translate" || undefined}
            onClick={() => setMethod("translate")}
          >
            <strong>{t("maker.translator")}</strong>
            <small>{t("maker.translatorHint")}</small>
          </button>
          <button
            role="radio"
            aria-checked={method() === "ai"}
            data-active={method() === "ai" || undefined}
            disabled={!options()?.ai || (!account() && !canSignIn())}
            onClick={pickAi}
          >
            <strong>{t("maker.ai")}</strong>
            <small>{aiHint()}</small>
          </button>
        </div>
      </div>

      <Show when={method() === "ai"}>
        <div class="maker-field" role="radiogroup" aria-label={t("maker.tone")}>
          <span>{t("maker.tone")}</span>
          <div class="filters maker-tones">
            <For each={options()?.tones ?? []}>
              {(entry) => (
                <button
                  role="radio"
                  aria-checked={tone() === entry}
                  data-active={tone() === entry || undefined}
                  disabled={toneTaken(entry)}
                  title={toneTaken(entry) ? t("maker.toneMade") : undefined}
                  onClick={() => setTone(entry)}
                >
                  {t(TONE_LABEL[entry])}
                </button>
              )}
            </For>
          </div>
          <Show when={tone() === "custom"}>
            <input
              class="maker-input"
              type="text"
              maxLength={160}
              placeholder={t("maker.customPlaceholder")}
              value={custom()}
              onInput={(event) => setCustom(event.currentTarget.value)}
            />
          </Show>
        </div>
      </Show>

      <Show when={error()}>
        <p class="maker-error">{error()}</p>
      </Show>

      <div class="maker-actions">
        <button class="btn btn-ghost" onClick={props.onBack}>
          {t("maker.back")}
        </button>
        <button
          class="btn btn-primary"
          disabled={
            busy() ||
            !props.sources.length ||
            !target() ||
            (method() === "ai" && tone() === "custom" && !custom().trim())
          }
          onClick={() => void create()}
        >
          {busy() ? t("common.loading") : t("maker.start")}
        </button>
      </div>
    </div>
  );
}
