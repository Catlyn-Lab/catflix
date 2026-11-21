import { createResource, createSignal, For, Show } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { clean } from "../lib/format";
import { search, type Item } from "../lib/api";
import { Card, Empty, Search as SearchIcon, State } from "../components/ui";

export default function SearchPage() {
  const [params, setParams] = useSearchParams<{ q?: string }>();
  const navigate = useNavigate();
  const [typed, setTyped] = createSignal(params.q ?? "");
  const term = () => (params.q ?? "").trim();

  const [results, resultsCtl] = createResource(
    () => term() || null,
    async (query) => {
      const payload = await search(query);
      return clean(payload.results);
    },
  );

  const submit = (event: Event) => {
    event.preventDefault();
    setParams({ q: typed() });
  };

  return (
    <div class="wrap">
      <header class="page-head">
        <h1>Search</h1>
        <p>Films, series and anime across the whole catalogue.</p>
      </header>

      <form class="filters" onSubmit={submit}>
        <div class="searchbox" style={{ "min-width": "320px" }}>
          <SearchIcon />
          <input
            placeholder="Search films, series and anime"
            value={typed()}
            onInput={(event) => setTyped(event.currentTarget.value)}
            autofocus
          />
        </div>
        <button class="btn btn-primary" type="submit">
          Search
        </button>
        <Show when={term()}>
          <button
            class="btn btn-ghost"
            type="button"
            onClick={() => {
              setTyped("");
              setParams({ q: "" });
            }}
          >
            Clear
          </button>
        </Show>
      </form>

      <Show when={term()} fallback={<Empty title="Search the catalogue" hint="Titles, not plot summaries." />}>
        <Show
          when={!results.error}
          fallback={
            <State error>
              <strong>Search failed</strong>
              <span>{String(results.error?.message ?? results.error)}</span>
              <button class="btn btn-ghost" onClick={() => void resultsCtl.refetch()}>
                Try again
              </button>
            </State>
          }
        >
          <Show when={!results.loading} fallback={<State spinner>Searching…</State>}>
            <Show
              when={results()?.length}
              fallback={<Empty title={`No matches for “${term()}”`} hint="Try a shorter query." />}
            >
              <div class="grid">
                <For each={results()!}>{(item: Item) => <Card item={item} />}</For>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>

      <Show when={!term()}>
        <div style={{ "margin-top": "18px" }}>
          <button class="btn btn-ghost" onClick={() => navigate("/")}>
            Back to browsing
          </button>
        </div>
      </Show>
    </div>
  );
}
