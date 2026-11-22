/** Icons and small shared pieces. */

import { A } from "@solidjs/router";
import { createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { getProgress } from "../lib/store";
import { rating, year } from "../lib/format";
import { LANGUAGES, language, setLanguage, t, type Language } from "../lib/i18n";
import { useTranslated } from "../lib/translate";
import type { Item } from "../lib/api";

type IconProps = { class?: string };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
} as const;

export const Play = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class} aria-hidden="true">
    <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
  </svg>
);

export const Pause = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class} aria-hidden="true">
    <rect x="6" y="4" width="4.2" height="16" rx="1.4" />
    <rect x="13.8" y="4" width="4.2" height="16" rx="1.4" />
  </svg>
);

export const Back = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const Forward = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const Close = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const Search = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

export const Volume = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class} aria-hidden="true">
    <path d="M4 9.5h2.6l4.2-3.4a.75.75 0 0 1 1.2.6v10.6a.75.75 0 0 1-1.2.6L6.6 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" {...stroke} />
  </svg>
);

export const Muted = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class} aria-hidden="true">
    <path d="M4 9.5h2.6l4.2-3.4a.75.75 0 0 1 1.2.6v10.6a.75.75 0 0 1-1.2.6L6.6 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" {...stroke} />
  </svg>
);

export const Expand = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" />
  </svg>
);

export const Compress = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <path d="M9 4v5H4M15 20v-5h5M15 4v5h5M9 20v-5H4" />
  </svg>
);

export const Next = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class} aria-hidden="true">
    <path d="M5 5.9v12.2a.9.9 0 0 0 1.4.75l8.9-6.1a.9.9 0 0 0 0-1.5L6.4 5.15A.9.9 0 0 0 5 5.9Z" />
    <rect x="17" y="5" width="2.6" height="14" rx="1.2" />
  </svg>
);

/** Circular arrow with the seconds drawn by the caller's label. */
export const SkipBack = (p: IconProps) => (
  <svg viewBox="0 0 24 24" class={p.class} aria-hidden="true">
    <path d="M12 5a8 8 0 1 1-7.4 5" {...stroke} />
    <path d="M12 1.8v6.4L7.6 5Z" fill="currentColor" />
    <text x="12" y="16.2" text-anchor="middle" font-size="7.2" font-weight="700" fill="currentColor">
      10
    </text>
  </svg>
);

export const SkipForward = (p: IconProps) => (
  <svg viewBox="0 0 24 24" class={p.class} aria-hidden="true">
    <path d="M12 5a8 8 0 1 0 7.4 5" {...stroke} />
    <path d="M12 1.8v6.4L16.4 5Z" fill="currentColor" />
    <text x="12" y="16.2" text-anchor="middle" font-size="7.2" font-weight="700" fill="currentColor">
      10
    </text>
  </svg>
);

export const Sliders = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.2" />
    <circle cx="9" cy="17" r="2.2" />
  </svg>
);

export const Captions = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="3.5" />
    <path d="M7.5 13.5h3M13.5 13.5h3" />
  </svg>
);

export const Pip = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <path d="M11 19H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2" />
    <rect x="13" y="13" width="8" height="6" rx="1.5" fill="currentColor" />
  </svg>
);

export const Check = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} stroke-width="2.4" class={p.class} aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const Star = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class} aria-hidden="true">
    <path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8Z" />
  </svg>
);

export const HomeIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z" />
  </svg>
);

export const FilmIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <rect x="3.5" y="4" width="17" height="16" rx="3" />
    <path d="M8 4v16M16 4v16M3.5 9.3H8M3.5 14.7H8M16 9.3h4.5M16 14.7h4.5" />
  </svg>
);

export const SeriesIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <rect x="3" y="7" width="18" height="12.5" rx="3" />
    <path d="M8.5 3.5 12 7l3.5-3.5" />
  </svg>
);

export const SparkleIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class} aria-hidden="true">
    <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9ZM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9Z" />
  </svg>
);

export const LotusIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <path d="M12 4c2.2 2 3.3 4.3 3.3 6.9 0 1.6-.6 3-1.7 4.2h-3.2a6.1 6.1 0 0 1-1.7-4.2C8.7 8.3 9.8 6 12 4Z" />
    <path d="M4 10.5c2.4.4 4.2 1.6 5.5 3.4.6.9 1 1.9 1.3 3H5.6A6.4 6.4 0 0 1 4 12.8Z" />
    <path d="M20 10.5c-2.4.4-4.2 1.6-5.5 3.4-.6.9-1 1.9-1.3 3h5.2A6.4 6.4 0 0 0 20 12.8Z" />
  </svg>
);

/** The Catflix mark: a cat-eared play button. */
export const Cat = (p: IconProps) => (
  <svg viewBox="0 0 48 44" class={p.class} aria-hidden="true">
    <path
      fill="currentColor"
      d="M7 22C5.6 12 6.6 4.6 9.6 3.2 12.8 1.8 19 8 22.4 13.6ZM41 22c1.4-10 .4-17.4-2.6-18.8C35.200 1.800 29 8 25.600 13.600Z"
    />
    <rect x="4" y="11.500" width="40" height="30" rx="13.500" fill="currentColor" />
    <path
      fill="#fff"
      d="M20 20.400v12.200a1.200 1.200 0 0 0 1.850 1l9.500-6.100a1.200 1.200 0 0 0 0-2L21.850 19.400a1.200 1.200 0 0 0-1.850 1Z"
    />
  </svg>
);

export const Globe = (p: IconProps) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.200 3.900 8.500s-1.300 6.100-3.900 8.500c-2.600-2.400-3.900-5.200-3.900-8.500S9.400 5.900 12 3.500Z" />
  </svg>
);

/** Catflix link for an item. */
export function href(item: { type: string; id: string }) {
  if (item.type === "anime") return `/anime/${item.id}`;
  if (item.type === "drama") return `/drama/${item.id}`;
  return `/${item.type === "movie" ? "movie" : "series"}/${item.id}`;
}

export function Card(props: { item: Item }) {
  const progress = () => {
    const record = getProgress(props.item.type, props.item.id);
    return record && record.durationSeconds > 0
      ? Math.min(100, Math.round((record.positionSeconds / record.durationSeconds) * 100))
      : null;
  };
  const score = () => rating(props.item.rating);
  const meta = () =>
    [
      year(props.item.year),
      props.item.type === "movie"
        ? t("common.film")
        : props.item.type === "anime"
          ? t("detail.anime")
          : props.item.type === "drama"
            ? t("detail.drama")
            : t("common.series"),
    ]
      .filter(Boolean)
      .join(" · ");
  const [broken, setBroken] = createSignal(false);

  return (
    <A class="card" href={href(props.item)}>
      <div class="art">
        <Show
          when={props.item.image && !broken()}
          fallback={<span class="art-title">{props.item.title}</span>}
        >
          <img
            src={props.item.image!}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setBroken(true)}
          />
        </Show>
        <Show when={score()}>
          <span class="badge">
            <Star /> {score()}
          </span>
        </Show>
        <Show when={progress()}>
          <div class="progress">
            <i style={{ width: `${progress()}%` }} />
          </div>
        </Show>
      </div>
      <div class="meta">
        <strong>{props.item.title}</strong>
        <Show when={meta()}>
          <span>{meta()}</span>
        </Show>
      </div>
    </A>
  );
}

export function Rail(props: { heading: string; items: Item[] }) {
  let track!: HTMLDivElement;
  const [edges, setEdges] = createSignal({ start: true, end: false });

  const measure = () => {
    // The track only exists once the rail has items to show.
    if (!track) return;
    setEdges({
      start: track.scrollLeft < 8,
      end: track.scrollLeft + track.clientWidth > track.scrollWidth - 8,
    });
  };
  const page = (sign: number) => {
    track.scrollBy({ left: sign * track.clientWidth * 0.85, behavior: "smooth" });
  };

  onMount(() => {
    measure();
    const watcher = new ResizeObserver(measure);
    if (track) watcher.observe(track);
    onCleanup(() => watcher.disconnect());
  });

  return (
    <Show when={props.items.length}>
      <section class="rail">
        <div class="rail-head">
          <h2>{props.heading}</h2>
        </div>
        <div class="rail-body">
          <div class="rail-track" ref={track} onScroll={measure}>
            <For each={props.items}>{(item) => <Card item={item} />}</For>
          </div>
          <Show when={!edges().start}>
            <button
              class="rail-arrow"
              data-side="start"
              tabindex="-1"
              aria-label={t("common.scrollBack")}
              onClick={() => page(-1)}
            >
              <Back />
            </button>
          </Show>
          <Show when={!edges().end}>
            <button
              class="rail-arrow"
              data-side="end"
              tabindex="-1"
              aria-label={t("common.scrollForward")}
              onClick={() => page(1)}
            >
              <Forward />
            </button>
          </Show>
        </div>
      </section>
    </Show>
  );
}

/** Placeholder rows shown while the catalogue loads. */
export function SkeletonRails(props: { rows?: number }) {
  return (
    <div class="skeleton" aria-hidden="true">
      <For each={Array.from({ length: props.rows ?? 3 })}>
        {() => (
          <section class="rail">
            <div class="rail-head">
              <span class="bone bone-line" />
            </div>
            <div class="rail-track">
              <For each={Array.from({ length: 10 })}>{() => <div class="bone bone-card" />}</For>
            </div>
          </section>
        )}
      </For>
    </div>
  );
}

export function SkeletonGrid(props: { count?: number }) {
  return (
    <div class="grid skeleton" aria-hidden="true">
      <For each={Array.from({ length: props.count ?? 18 })}>{() => <div class="bone bone-card" />}</For>
    </div>
  );
}

export function State(props: { children: JSX.Element; spinner?: boolean; error?: boolean }) {
  return (
    <div class={props.error ? "state error" : "state"} role={props.error ? "alert" : "status"}>
      <Show when={props.spinner}>
        <div class="spinner" />
      </Show>
      {props.children}
    </div>
  );
}

export function Empty(props: { title: string; hint?: string }) {
  return (
    <State>
      <Cat class="cat" />
      <strong>{props.title}</strong>
      <Show when={props.hint}>
        <span>{props.hint}</span>
      </Show>
    </State>
  );
}

/** Catalogue text (always English) shown in the viewer's language. */
export function Translated(props: { text?: string | null }) {
  const text = useTranslated(() => props.text);
  return <>{text()}</>;
}

/**
 * The language question. Shown once on first run, and again from the top bar. Both languages
 * are written out in full because the answer is not known yet.
 */
export function LanguageDialog(props: { onClose: () => void; firstRun?: boolean }) {
  let panel!: HTMLDivElement;

  const choose = (next: Language) => {
    setLanguage(next);
    props.onClose();
  };

  onMount(() => {
    panel.querySelector<HTMLElement>("[data-active]")?.focus();

    // Keep the keyboard and the remote inside the dialog while it is open.
    const onKey = (event: KeyboardEvent) => {
      const options = Array.from(panel.querySelectorAll<HTMLElement>("button"));
      const at = options.indexOf(document.activeElement as HTMLElement);
      const step =
        event.key === "ArrowDown" || event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey)
          ? 1
          : event.key === "ArrowUp" || event.key === "ArrowLeft" || event.key === "Tab"
            ? -1
            : 0;
      if (step) {
        event.preventDefault();
        options[(at + step + options.length) % options.length]?.focus();
      } else if (event.key === "Escape" && !props.firstRun) {
        event.preventDefault();
        props.onClose();
      }
      if (event.key !== "Enter" && event.key !== " ") event.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    onCleanup(() => window.removeEventListener("keydown", onKey, true));
  });

  return (
    <div class="dialog-scrim" onClick={() => !props.firstRun && props.onClose()}>
      <div
        class="dialog"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-title"
        onClick={(event) => event.stopPropagation()}
      >
        <Cat class="dialog-mark" />
        <h2 id="language-title">Choose your language</h2>
        <p lang="id">Pilih bahasa Anda</p>
        <div class="dialog-options">
          <For each={LANGUAGES}>
            {(entry) => (
              <button
                class="dialog-option"
                lang={entry.id}
                data-active={language() === entry.id || undefined}
                data-current={(!props.firstRun && language() === entry.id) || undefined}
                onClick={() => choose(entry.id)}
              >
                <span>
                  <strong>{entry.name}</strong>
                  <small>{entry.note}</small>
                </span>
                <Show when={!props.firstRun && language() === entry.id}>
                  <Check />
                </Show>
              </button>
            )}
          </For>
        </div>
        <p class="dialog-note">
          You can change this any time from the top bar.
          <br />
          <span lang="id">Anda bisa mengubahnya kapan saja dari bilah atas.</span>
        </p>
      </div>
    </div>
  );
}
