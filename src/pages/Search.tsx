import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { clean } from "../lib/format";
import { search, type Item } from "../lib/api";
import { animeSearch, dramaSearch } from "../lib/sources";
import { t } from "../lib/i18n";
import { Card, Close, Empty, Search as SearchIcon, SkeletonGrid, State } from "../components/ui";

export default function SearchPage() {
  const [params, setParams] = useSearchParams<{ q?: string }>();
  const [typed, setTyped] = createSignal(params.q ?? "");
  const term = () => (params.q ?? "").trim();
  let pending = 0;

  const [results, resultsCtl] = createResource(
    () => term() || null,
    async (query) => {
      // The catalogue is one source; anime and dramas have their own, and all three answer at once.
      const [catalogue, anime, drama] = await Promise.all([
        search(query).catch(() => ({ results: [] })),
        animeSearch(query).catch(() => []),
        dramaSearch(query).catch(() => []),
      ]);
      return {
        catalogue: clean(catalogue.results),
        anime,
        drama,
        total: (catalogue.results ?? []).length + anime.length + drama.length,
      };
    },
  );

  const commit = (value: string) => {
    clearTimeout(pending);
    setParams({ q: value.trim() || undefined }, { replace: true });
  };

  // Results follow the typing after a short pause.
  const onInput = (value: string) => {
    setTyped(value);
    clearTimeout(pending);
    pending = window.setTimeout(() => commit(value), 420);
  };

  onCleanup(() => clearTimeout(pending));

  const submit = (event: Event) => {
    event.preventDefault();
    commit(typed());
  };

  return (
    <div class="wrap">
      <header class="page-head">
        <h1>{t("nav.search")}</h1>
      </header>

      <form class="searchbox searchbox-page" role="search" onSubmit={submit}>
        <SearchIcon />
        <input
          type="search"
          enterkeyhint="search"
          placeholder={t("search.pagePlaceholder")}
          aria-label={t("search.label")}
          value={typed()}
          onInput={(event) => onInput(event.currentTarget.value)}
          autofocus
        />
        <Show when={typed()}>
          <button
            class="icon-btn"
            type="button"
            aria-label={t("search.clear")}
            onClick={() => {
              setTyped("");
              commit("");
            }}
          >
            <Close />
          </button>
        </Show>
      </form>

      <Show when={term()} fallback={<Empty title={t("search.label")} hint={t("search.emptyHint")} />}>
        <Show
          when={!results.error}
          fallback={
            <State error>
              <strong>{t("search.error")}</strong>
              <span>{String(results.error?.message ?? results.error)}</span>
              <button class="btn btn-ghost" onClick={() => void resultsCtl.refetch()}>
                {t("common.retry")}
              </button>
            </State>
          }
        >
          <Show when={!results.loading} fallback={<SkeletonGrid count={12} />}>
            <Show
              when={results()?.total}
              fallback={<Empty title={t("search.noneTitle", { term: term() })} hint={t("search.noneHint")} />}
            >
              <p class="result-count">
                {results()!.total === 1
                  ? t("search.countOne", { term: term() })
                  : t("search.count", { count: results()!.total, term: term() })}
              </p>

              <Show when={results()!.catalogue.length}>
                <div class="grid">
                  <For each={results()!.catalogue}>{(item: Item) => <Card item={item} />}</For>
                </div>
              </Show>

              <Show when={results()!.anime.length}>
                <section class="section">
                  <h2>{t("search.anime")}</h2>
                  <div class="grid">
                    <For each={results()!.anime}>{(item: Item) => <Card item={item} />}</For>
                  </div>
                </section>
              </Show>

              <Show when={results()!.drama.length}>
                <section class="section">
                  <h2>{t("search.drama")}</h2>
                  <div class="grid">
                    <For each={results()!.drama}>{(item: Item) => <Card item={item} />}</For>
                  </div>
                </section>
              </Show>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
