import { createResource, createSignal, For, Show } from "solid-js";
import { clean } from "../lib/format";
import { discover, genres as fetchGenres, type Item, type MediaType } from "../lib/api";
import { Card, Empty, State } from "../components/ui";


const ORDERS = [
  { id: "popular", label: "Popular" },
  { id: "rating", label: "Top rated" },
  { id: "new", label: "Newest" },
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

  return (
    <div class="wrap">
      <header class="page-head">
        <h1>{props.type === "movie" ? "Films" : "Series"}</h1>
        <p>Everything in the catalogue, newest first.</p>
      </header>

      <div class="filters">
        <For each={ORDERS}>
          {(option) => (
            <button data-active={order() === option.id || undefined} onClick={() => pick({ order: option.id })}>
              {option.label}
            </button>
          )}
        </For>
      </div>

      <div class="filters">
        <button data-active={genre() === null || undefined} onClick={() => pick({ genre: null })}>
          All genres
        </button>
        <For each={genreList()?.genres ?? []}>
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
            <strong>Could not load this list</strong>
            <span>{String(result.error?.message ?? result.error)}</span>
            <button class="btn btn-ghost" onClick={() => void resultCtl.refetch()}>
              Try again
            </button>
          </State>
        }
      >
        <Show when={!result.loading} fallback={<State spinner>Loading…</State>}>
          <Show when={result()?.items.length} fallback={<Empty title="Nothing here" hint="Try another genre." />}>
            <div class="grid">
              <For each={result()!.items}>{(item: Item) => <Card item={item} />}</For>
            </div>

            <Show when={(result()?.pages ?? 1) > 1}>
              <div class="row-actions" style={{ "justify-content": "center", "margin-top": "28px" }}>
                <button class="btn btn-ghost" disabled={page() <= 1} onClick={() => setPage((n) => n - 1)}>
                  Previous
                </button>
                <span style={{ padding: "12px 6px", color: "var(--text-faint)" }}>
                  Page {page()} of {result()!.pages}
                </span>
                <button
                  class="btn btn-ghost"
                  disabled={page() >= (result()?.pages ?? 1)}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Next
                </button>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>

    </div>
  );
}
