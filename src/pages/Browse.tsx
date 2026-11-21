import { createResource, createSignal, For, Show } from "solid-js";
import { clean } from "../lib/format";
import { discover, genres as fetchGenres, type Item, type MediaType } from "../lib/api";
import { genreName, t, type Phrase } from "../lib/i18n";
import { Card, Empty, SkeletonGrid, State } from "../components/ui";

const ORDERS: { id: string; label: Phrase }[] = [
  { id: "popular", label: "browse.popular" },
  { id: "rating", label: "browse.topRated" },
  { id: "new", label: "browse.newest" },
];

export default function Browse(props: { type: MediaType }) {
  const [genre, setGenre] = createSignal<number | null>(null);
  const [order, setOrder] = createSignal("popular");
  const [page, setPage] = createSignal(1);

  const [genreList] = createResource(fetchGenres);

  const [result, resultCtl] = createResource(
    () => ({ genre: genre(), order: order(), page: page(), type: props.type }),
    async (query) => {
      const payload = await discover(query.type, query.page, query.genre ?? undefined);
      let items = clean(payload.results);
      if (query.order === "rating") {
        items = items.sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
      } else if (query.order === "new") {
        items = items.sort((a, b) => String(b.year ?? "").localeCompare(String(a.year ?? "")));
      }
      return { items, pages: payload.totalPages ?? 1 };
    },
  );

  const pick = (patch: { genre?: number | null; order?: string }) => {
    if (patch.genre !== undefined) setGenre(patch.genre);
    if (patch.order !== undefined) setOrder(patch.order);
    setPage(1);
  };

  const turn = (step: number) => {
    setPage((number) => number + step);
    document.querySelector(".main")?.scrollTo({ top: 0 });
  };

  return (
    <div class="wrap">
      <header class="page-head">
        <h1>{t(props.type === "movie" ? "nav.films" : "nav.series")}</h1>
        <div class="segmented" role="group" aria-label={t("browse.sortBy")}>
          <For each={ORDERS}>
            {(option) => (
              <button
                data-active={order() === option.id || undefined}
                onClick={() => pick({ order: option.id })}
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
        <For each={genreList()?.genres ?? []}>
          {(entry) => (
            <button data-active={genre() === entry.id || undefined} onClick={() => pick({ genre: entry.id })}>
              {genreName(entry.name)}
            </button>
          )}
        </For>
      </div>

      <Show
        when={!result.error}
        fallback={
          <State error>
            <strong>{t("browse.error")}</strong>
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
            fallback={<Empty title={t("browse.emptyTitle")} hint={t("browse.emptyHint")} />}
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
                  disabled={page() >= (result()?.pages ?? 1)}
                  onClick={() => turn(1)}
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
