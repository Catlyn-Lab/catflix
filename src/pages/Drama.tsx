import { createResource, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import type { Item } from "../lib/api";
import { DRAMA_KINDS, DRAMA_REGIONS, DRAMA_STATES, dramaList } from "../lib/sources";
import { t } from "../lib/i18n";
import { Card, Empty, SkeletonGrid, State } from "../components/ui";

export default function Drama() {
  const [region, setRegion] = createSignal<number | null>(null);
  const [kind, setKind] = createSignal<number | null>(null);
  const [state, setState] = createSignal<number | null>(null);
  const [page, setPage] = createSignal(1);

  const [result, resultCtl] = createResource(
    () => ({ region: region(), kind: kind(), state: state(), page: page() }),
    (query) =>
      dramaList(query.page, query.region ?? undefined, query.kind ?? undefined, query.state ?? undefined),
  );

  const pick = (patch: { region?: number | null; kind?: number | null; state?: number | null }) => {
    if (patch.region !== undefined) setRegion(patch.region);
    if (patch.kind !== undefined) setKind(patch.kind);
    if (patch.state !== undefined) setState(patch.state);
    setPage(1);
  };

  const turn = (step: number) => {
    setPage((number) => number + step);
    document.querySelector(".main")?.scrollTo({ top: 0 });
  };

  return (
    <div class="wrap">
      <header class="page-head">
        <h1>{t("nav.drama")}</h1>
        <div class="segmented" role="group" aria-label={t("drama.kind")}>
          <button data-active={kind() === null || undefined} onClick={() => pick({ kind: null })}>
            {t("drama.allKinds")}
          </button>
          <For each={DRAMA_KINDS}>
            {(entry) => (
              <button data-active={kind() === entry.id || undefined} onClick={() => pick({ kind: entry.id })}>
                {t(entry.id === 9 ? "drama.films" : "drama.series")}
              </button>
            )}
          </For>
        </div>
      </header>

      <div class="filters" role="group" aria-label={t("drama.region")}>
        <button data-active={region() === null || undefined} onClick={() => pick({ region: null })}>
          {t("drama.allRegions")}
        </button>
        <For each={DRAMA_REGIONS}>
          {(entry) => (
            <button
              data-active={region() === entry.id || undefined}
              onClick={() => pick({ region: entry.id })}
            >
              {entry.name}
            </button>
          )}
        </For>
      </div>

      <div class="filters" role="group" aria-label={t("drama.state")}>
        <button data-active={state() === null || undefined} onClick={() => pick({ state: null })}>
          {t("drama.anyState")}
        </button>
        <For each={DRAMA_STATES}>
          {(entry) => (
            <button data-active={state() === entry.id || undefined} onClick={() => pick({ state: entry.id })}>
              {t(entry.id === 12 ? "browse.ongoing" : "browse.completed")}
            </button>
          )}
        </For>
      </div>

      <Show
        when={!result.error}
        fallback={
          <State error>
            <strong>{t("drama.error")}</strong>
            <span>{String(result.error?.message ?? result.error)}</span>
            <button class="btn btn-ghost" onClick={() => void resultCtl.refetch()}>
              {t("common.retry")}
            </button>
          </State>
        }
      >
        <Show when={!result.loading} fallback={<SkeletonGrid />}>
          <Show
            when={result()?.items.length}
            fallback={<Empty title={t("drama.emptyTitle")} hint={t("drama.emptyHint")} />}
          >
            <div class="grid">
              <For each={result()!.items}>{(item: Item) => <Card item={item} />}</For>
            </div>
            <Show when={(result()?.pages ?? 1) > 1}>
              <div class="pager">
                <button class="btn btn-ghost" disabled={page() <= 1} onClick={() => turn(-1)}>
                  {t("browse.previous")}
                </button>
                <span>{t("browse.page", { page: page(), pages: result()!.pages })}</span>
                <button
                  class="btn btn-ghost"
                  disabled={page() >= (result()!.pages ?? 1)}
                  onClick={() => turn(1)}
                >
                  {t("browse.next")}
                </button>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>

      <footer class="foot">
        {t("drama.footer")}{" "}
        <A class="source-link" href="https://kissasia.biz/" target="_blank" rel="noreferrer">
          kissasia.biz
        </A>
      </footer>
    </div>
  );
}
