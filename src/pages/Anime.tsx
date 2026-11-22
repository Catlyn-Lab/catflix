import { createResource, createSignal, For, Show } from "solid-js";
import type { Item } from "../lib/api";
import { ANIME_GENRES, animeList, type AnimeMode } from "../lib/sources";
import { t } from "../lib/i18n";
import { Card, Empty, SkeletonGrid, State } from "../components/ui";

const MODES: { id: AnimeMode; label: "anime.popular" | "anime.ongoing" | "anime.newest" | "anime.az" }[] = [
  { id: "trending", label: "anime.popular" },
  { id: "updated", label: "anime.ongoing" },
  { id: "newest", label: "anime.newest" },
  { id: "az", label: "anime.az" },
];

export default function Anime() {
  const [genre, setGenre] = createSignal<number | null>(null);
  const [mode, setMode] = createSignal<AnimeMode>("trending");
  const [page, setPage] = createSignal(1);

  const genres = () => ANIME_GENRES;

  const [result, resultCtl] = createResource(
    () => ({ genre: genre(), mode: mode(), page: page() }),
    (query) => animeList(query.mode, query.page, query.genre ?? undefined),
  );

  const pick = (patch: { genre?: number | null; mode?: AnimeMode }) => {
    if (patch.genre !== undefined) setGenre(patch.genre);
    if (patch.mode !== undefined) setMode(patch.mode);
    setPage(1);
  };

  return (
    <div class="wrap">
      <header class="page-head">
        <h1>{t("nav.anime")}</h1>
        <div class="segmented" role="group" aria-label={t("browse.sortBy")}>
          <For each={MODES}>
            {(option) => (
              <button
                data-active={mode() === option.id || undefined}
                onClick={() => pick({ mode: option.id })}
              >
                {t(option.label)}
              </button>
            )}
          </For>
        </div>
      </header>

      <div class="filters" role="group" aria-label={t("browse.genre")}>
        <button data-active={genre() === null || undefined} onClick={() => pick({ genre: null })}>
          {t("browse.allGenres")}
        </button>
        <For each={genres()}>
          {(entry) => (
            <button data-active={genre() === entry.id || undefined} onClick={() => pick({ genre: entry.id })}>
              {entry.name}
            </button>
          )}
        </For>
      </div>

      <Show
        when={!result.error}
        fallback={
          <State error>
            <strong>{t("anime.error")}</strong>
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
            fallback={<Empty title={t("anime.emptyTitle")} hint={t("anime.emptyHint")} />}
          >
            <div class="grid">
              <For each={result()!.items}>{(item: Item) => <Card item={item} />}</For>
            </div>
            <Show when={(result()?.pages ?? 1) > 1}>
              <div class="pager">
                <button class="btn btn-ghost" disabled={page() <= 1} onClick={() => setPage((n) => n - 1)}>
                  {t("browse.previous")}
                </button>
                <span>{t("browse.page", { page: page(), pages: result()!.pages })}</span>
                <button
                  class="btn btn-ghost"
                  disabled={page() >= (result()!.pages ?? 1)}
                  onClick={() => setPage((n) => n + 1)}
                >
                  {t("browse.next")}
                </button>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
