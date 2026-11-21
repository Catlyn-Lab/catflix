/** Icons and small shared pieces. */

import { A } from "@solidjs/router";
import { For, Show, type JSX } from "solid-js";
import { getProgress } from "../lib/store";
import { rating, year } from "../lib/format";
import type { Item } from "../lib/api";

const stroke = { fill: "none", stroke: "currentColor", "stroke-width": "2" } as const;

export const Play = (p: { class?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class} aria-hidden="true">
    <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
  </svg>
);

export const Pause = (p: { class?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class} aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

export const Back = (p: { class?: string }) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

export const Close = (p: { class?: string }) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
  </svg>
);

export const Search = (p: { class?: string }) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" stroke-linecap="round" />
  </svg>
);

export const Volume = (p: { class?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class} aria-hidden="true">
    <path d="M4 9h3l5-4v14l-5-4H4Z" />
    <path d="M16 8.5a5 5 0 0 1 0 7" {...stroke} stroke-linecap="round" />
  </svg>
);

export const Muted = (p: { class?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class} aria-hidden="true">
    <path d="M4 9h3l5-4v14l-5-4H4Z" />
    <path d="M16 9.5l4 5M20 9.5l-4 5" {...stroke} stroke-linecap="round" />
  </svg>
);

export const Expand = (p: { class?: string }) => (
  <svg viewBox="0 0 24 24" {...stroke} class={p.class} aria-hidden="true">
    <path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

export const Next = (p: { class?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class} aria-hidden="true">
    <path d="M6 5.5v13l9-6.5Z" />
    <rect x="16" y="5" width="2.5" height="14" rx="1" />
  </svg>
);

export const Cat = (p: { class?: string }) => (
  <svg viewBox="0 0 48 40" class={p.class} aria-hidden="true" fill="currentColor">
    <path d="M6 12 9 3l8 5.6a22 22 0 0 1 14 0L39 3l3 9a16 15 0 0 1 1 7c0 9-8 14-19 14S5 28 5 19a16 15 0 0 1 1-7Z" />
    <circle cx="17" cy="18" r="2.2" fill="#0b0d12" />
    <circle cx="31" cy="18" r="2.2" fill="#0b0d12" />
    <path d="M20 25h8l-4 4-4-4Z" fill="#0b0d12" />
  </svg>
);

/** Catflix link for an item. */
export function href(item: { type: string; id: string }) {
  return `/${item.type === "movie" ? "movie" : "series"}/${item.id}`;
}

export function Card(props: { item: Item }) {
  const progress = () => {
    const record = getProgress(props.item.type, props.item.id);
    return record && record.durationSeconds > 0
      ? Math.min(100, Math.round((record.positionSeconds / record.durationSeconds) * 100))
      : null;
  };
  const meta = () => [year(props.item.year), rating(props.item.rating)].filter(Boolean).join(" · ");

  return (
    <A class="card" href={href(props.item)}>
      <div class="art" style={props.item.image ? { "background-image": `url("${props.item.image}")` } : undefined} />
      <Show when={progress()}>
        <div class="progress">
          <i style={{ width: `${progress()}%` }} />
        </div>
      </Show>
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
  return (
    <Show when={props.items.length}>
      <section class="rail">
        <div class="rail-head">
          <h2>{props.heading}</h2>
        </div>
        <div class="rail-track">
          <For each={props.items}>{(item) => <Card item={item} />}</For>
        </div>
      </section>
    </Show>
  );
}

export function State(props: { children: JSX.Element; spinner?: boolean; error?: boolean }) {
  return (
    <div class={props.error ? "state error" : "state"}>
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
      <span class="cat">🐈</span>
      <strong>{props.title}</strong>
      <Show when={props.hint}>
        <span>{props.hint}</span>
      </Show>
    </State>
  );
}
