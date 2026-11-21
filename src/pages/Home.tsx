import { createResource, For, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { clean, rating, year } from "../lib/format";
import { details, home as fetchHome, type Item, type MediaType } from "../lib/api";
import { recent } from "../lib/store";
import { phraseOr, t } from "../lib/i18n";
import { Empty, href, Play, Rail, SkeletonRails, Star, State, Translated } from "../components/ui";

type Rail = { key: string; items: Item[] };

/** Row titles Catflix knows; anything new from the catalogue is shown as it arrives. */
const heading = (key: string) =>
  phraseOr(
    `rail.${key}`,
    key.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase()),
  );

export default function Home() {
  const navigate = useNavigate();
  const [feed, feedCtl] = createResource(fetchHome);

  const rails = (): Rail[] =>
    Object.entries(feed()?.rails ?? {})
      .filter(([key]) => key !== "success")
      .map(([key, page]) => ({
        key,
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
        type === "movie" ? { type: "movie" as const, id } : { type: "tv" as const, id: id.split(":")[0] };
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

  const wide = (url: string) => url.replace("/w500/", "/w1280/").replace("/w780/", "/w1280/");

  return (
    <Show
      when={!feed.error}
      fallback={
        <div class="wrap">
          <State error>
            <strong>{t("home.error")}</strong>
            <span>{String(feed.error?.message ?? feed.error)}</span>
            <button class="btn btn-ghost" onClick={() => void feedCtl.refetch()}>
              {t("common.retry")}
            </button>
          </State>
        </div>
      }
    >
      <Show
        when={!feed.loading}
        fallback={
          <>
            <section class="hero hero-skeleton" aria-hidden="true" />
            <div class="wrap wrap-rails">
              <SkeletonRails />
            </div>
          </>
        }
      >
        <Show when={hero()}>
          {(featured) => (
            <section class="hero">
              <Show when={featured().backdrop ?? featured().image}>
                {(image) => (
                  <div class="hero-art" style={{ "background-image": `url("${wide(image())}")` }} />
                )}
              </Show>
              <div class="hero-body">
                <p class="eyebrow">
                  {t(featured().type === "movie" ? "home.featuredFilm" : "home.featuredSeries")}
                </p>
                <h1>{featured().title}</h1>
                <div class="facts">
                  <Show when={rating(featured().rating)}>
                    <span class="score">
                      <Star /> {rating(featured().rating)}
                    </span>
                  </Show>
                  <Show when={year(featured().year)}>
                    <span>{year(featured().year)}</span>
                  </Show>
                  <span class="chip">{t(featured().type === "movie" ? "common.film" : "common.series")}</span>
                </div>
                <Show when={featured().overview}>
                  <p class="hero-overview">
                    <Translated text={featured().overview} />
                  </p>
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
                    <Play /> {t(featured().type === "movie" ? "home.play" : "home.episodes")}
                  </button>
                  <A class="btn btn-ghost" href={href(featured())}>
                    {t("home.moreInfo")}
                  </A>
                </div>
              </div>
            </section>
          )}
        </Show>

        <div class="wrap wrap-rails" data-flush={hero() ? undefined : true}>
          <Show when={resume().length}>
            <Rail heading={t("home.continue")} items={resume()} />
          </Show>
          <For each={rails()}>{(rail) => <Rail heading={heading(rail.key)} items={rail.items} />}</For>

          <Show when={!rails().length}>
            <Empty title={t("home.emptyTitle")} hint={t("home.emptyHint")} />
          </Show>

          <footer class="foot">{t("home.footer")}</footer>
        </div>
      </Show>
    </Show>
  );
}
