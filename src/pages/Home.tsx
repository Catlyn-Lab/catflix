import { For, Show } from "solid-js";
import { createResource } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { clean, rating, year } from "../lib/format";
import { details, home as fetchHome, type Item, type MediaType } from "../lib/api";
import { recent } from "../lib/store";
import { href, Rail, State } from "../components/ui";

type Rail = { key: string; heading: string; items: Item[] };

const LABELS: Record<string, string> = {
  trending_movies: "Trending films",
  popular_movies: "Popular films",
  popular_tv: "Popular series",
  popular_anime: "Popular anime",
  new_releases: "New releases",
  action_movies: "Action",
  scifi_movies: "Science fiction",
  thriller_movies: "Thriller",
  comedy_movies: "Comedy",
  airing_anime: "Airing now",
};

const heading = (key: string) =>
  LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());

export default function Home() {
  const navigate = useNavigate();
  const [feed, feedCtl] = createResource(fetchHome);

  const rails = (): Rail[] =>
    Object.entries(feed()?.rails ?? {})
      .filter(([key]) => key !== "success")
      .map(([key, page]) => ({
        key,
        heading: heading(key),
        items: clean((page as { results?: unknown }).results),
      }))
      .filter((rail) => rail.items.length > 1);

  const hero = () => feed()?.hero ?? null;

  // Watch records are keyed per film (`movie:<id>`) or per episode (`episode:<id>:<s>:<e>`);
  // show one card per film or series, newest first.
  const watched = () => {
    const seen = new Set<string>();
    const out: { type: MediaType; id: string; title?: string; poster?: string | null }[] = [];
    for (const { type, id, record } of recent()) {
      const entry =
        type === "movie"
          ? { type: "movie" as const, id }
          : { type: "tv" as const, id: id.split(":")[0] };
      const compound = `${entry.type}:${entry.id}`;
      if (!entry.id || seen.has(compound)) continue;
      seen.add(compound);
      out.push({ ...entry, title: record.title, poster: record.poster });
      if (out.length === 12) break;
    }
    return out;
  };

  // Older records were saved without a title or poster: look those up once.
  const [filled] = createResource(
    () => watched().filter((entry) => !entry.title || !entry.poster),
    async (missing) => {
      const found = await Promise.all(
        missing.map((entry) => details(entry.type, entry.id).catch(() => null)),
      );
      const byKey: Record<string, { title: string; poster?: string | null }> = {};
      found.forEach((info, index) => {
        if (info) {
          const entry = missing[index];
          byKey[`${entry.type}:${entry.id}`] = { title: info.title, poster: info.poster ?? info.backdrop };
        }
      });
      return byKey;
    },
  );

  const resume = (): Item[] =>
    watched()
      .map((entry) => {
        const extra = filled.latest?.[`${entry.type}:${entry.id}`];
        return {
          id: entry.id,
          type: entry.type,
          title: entry.title ?? extra?.title ?? "",
          image: entry.poster ?? extra?.poster ?? null,
        };
      })
      .filter((item) => item.title);

  return (
    <Show
      when={!feed.error}
      fallback={
        <div class="wrap">
          <State error>
            <strong>Could not reach the catalogue</strong>
            <span>{String(feed.error?.message ?? feed.error)}</span>
            <button class="btn btn-ghost" onClick={() => void feedCtl.refetch()}>
              Try again
            </button>
          </State>
        </div>
      }
    >
      <Show when={!feed.loading} fallback={<State spinner>Loading the catalogue…</State>}>
        <Show when={hero()}>
          {(featured) => (
            <section class="hero">
              <div
                class="hero-art"
                style={
                  featured().backdrop ?? featured().image
                    ? {
                        "background-image": `url("${(featured().backdrop ?? featured().image)!.replace("/w500/", "/w1280/").replace("/w780/", "/w1280/")}")`,
                      }
                    : undefined
                }
              />
              <div class="hero-body">
                <div class="facts">
                  <span class="chip">{featured().type === "movie" ? "Film" : "Series"}</span>
                  <Show when={year(featured().year)}>
                    <span class="dot">{year(featured().year)}</span>
                  </Show>
                  <Show when={rating(featured().rating)}>
                    <span class="dot">★ {rating(featured().rating)}</span>
                  </Show>
                </div>
                <h1>{featured().title}</h1>
                <Show when={featured().overview}>
                  <p>{featured().overview}</p>
                </Show>
                <div class="row-actions">
                  <button
                    class="btn btn-primary"
                    onClick={() =>
                      navigate(
                        featured().type === "movie"
                          ? `/watch/movie/${featured().id}`
                          : `/series/${featured().id}`,
                      )
                    }
                  >
                    Play
                  </button>
                  <A class="btn btn-ghost" href={href(featured())}>
                    Details
                  </A>
                </div>
              </div>
            </section>
          )}
        </Show>

        <div class="wrap">
          <Show when={resume().length}>
            <Rail heading="Continue watching" items={resume()} />
          </Show>
          <For each={rails()}>{(rail) => <Rail heading={rail.heading} items={rail.items} />}</For>

          <Show when={!rails().length}>
            <State>
              <span class="cat">🐈</span>
              <strong>The catalogue came back empty</strong>
              <span>The API may be moving between hosts. Try again in a moment.</span>
            </State>
          </Show>

          <footer class="foot">
            Catflix — a small, ad-free streaming app. Metadata courtesy of TMDB; films belong to their
            rights holders.
          </footer>
        </div>
      </Show>
    </Show>
  );
}
