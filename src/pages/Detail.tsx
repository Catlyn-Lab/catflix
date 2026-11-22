import { A, useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createResource, createSignal, For, on, Show } from "solid-js";
import { clean, episodeLabel, rating, runtime, year } from "../lib/format";
import {
  details,
  season as fetchSeason,
  type Details,
  type Episode,
  type ExtraType,
  type MediaType,
} from "../lib/api";
import { animeDetails, animeEpisodes, dramaDetails, dramaEpisodes } from "../lib/sources";
import { getProgress } from "../lib/store";
import { genreName, language, seasonName, t } from "../lib/i18n";
import { Card, Empty, Play, Star, State, Translated } from "../components/ui";

type TitleType = MediaType | ExtraType;
type Props = { type: TitleType; id: string };

/** Anime and dramas have their own source; films and series go to the catalogue API. */
const load = async (type: TitleType, id: string): Promise<Details> => {
  if (type === "anime") return animeDetails(id);
  if (type === "drama") return dramaDetails(id);
  return details(type, id);
};

const loadSeason = async (type: TitleType, id: string, number: number) => {
  if (type === "anime") return animeEpisodes(id);
  if (type === "drama") return dramaEpisodes(id);
  return fetchSeason(id, number);
};

const percent = (record: { positionSeconds: number; durationSeconds: number }) =>
  Math.min(99, Math.round((record.positionSeconds / Math.max(1, record.durationSeconds)) * 100));

export default function Detail(props: Props) {
  const navigate = useNavigate();
  const [found] = createResource(
    () => ({ type: props.type, id: props.id }),
    (query) => load(query.type, query.id),
  );

  // While another title is loading, the resource still holds the previous one. Show nothing
  // from it, or the page would sit on the wrong film under the new address.
  const current = () => (found.loading ? undefined : found());

  const [activeSeason, setActiveSeason] = createSignal<number | null>(null);
  // A season picked on one series does not carry over to the next.
  createEffect(
    on(
      () => `${props.type}:${props.id}`,
      () => setActiveSeason(null),
      { defer: true },
    ),
  );
  const seasonNumber = () =>
    activeSeason() ?? current()?.seasons?.find((entry) => entry.season_number > 0)?.season_number ?? 1;

  const [episodesList] = createResource(
    () =>
      props.type === "tv" || props.type === "anime" || props.type === "drama"
        ? { type: props.type, id: props.id, season: seasonNumber() }
        : null,
    async (query) => (await loadSeason(query.type, query.id, query.season)).episodes ?? [],
  );

  const facts = createMemo(() => {
    const item = current();
    if (!item) return [];
    const seasons = item.number_of_seasons;
    return [
      year(item.release_date ?? item.year),
      // Indonesian abbreviates hours as "j" (jam).
      language() === "id" ? runtime(item.runtime).replace("h", "j") : runtime(item.runtime),
      (props.type === "tv" || props.type === "drama") && seasons
        ? seasons === 1
          ? t("detail.seasonsOne")
          : t("detail.seasons", { count: seasons })
        : "",
    ].filter(Boolean) as string[];
  });

  // The player keeps one record per episode, keyed by series, season and episode number.
  const watchedEpisode = (episode: Episode) =>
    getProgress("episode", `${props.id}:${episode.season_number}:${episode.episode_number}`);
  const watchedFilm = () => (props.type === "movie" ? getProgress("movie", props.id) : null);

  const started = () => (episodesList() ?? []).find((episode) => watchedEpisode(episode));
  const nextUp = () => started() ?? (episodesList() ?? [])[0];

  const play = (episode?: Episode) => {
    if (props.type === "movie") return void navigate(`/watch/movie/${props.id}`);
    const target = episode ?? nextUp();
    if (target)
      navigate(`/watch/episode/${props.type}/${props.id}/${target.season_number}/${target.episode_number}`);
  };

  const playLabel = () => {
    if (props.type === "movie") return watchedFilm() ? t("detail.resume") : t("detail.play");
    const target = nextUp();
    if (!target) return t("detail.play");
    // Anime and dramas are one season long: "Episode 4" reads better than "S1E4".
    const code =
      props.type === "tv"
        ? episodeLabel(target.season_number, target.episode_number)
        : t("detail.episode", { number: target.episode_number });
    return t(started() ? "detail.resumeCode" : "detail.playCode", { code });
  };

  return (
    <Show
      when={!found.error}
      fallback={
        <div class="wrap">
          <State error>
            <strong>{t("detail.error")}</strong>
            <span>{String(found.error?.message ?? found.error)}</span>
            <A class="btn btn-ghost" href="/">
              {t("detail.backHome")}
            </A>
          </State>
        </div>
      }
    >
      <Show
        when={current()}
        fallback={
          <div class="wrap">
            <State spinner>{t("common.loading")}</State>
          </div>
        }
      >
        {(item) => (
          <>
            <section class="detail detail-hero">
              <Show when={item().backdrop ?? item().poster}>
                {(image) => <div class="detail-art" style={{ "background-image": `url("${image()}")` }} />}
              </Show>

              <div class="detail-grid">
                <div
                  class="detail-poster"
                  style={item().poster ? { "background-image": `url("${item().poster}")` } : undefined}
                />

                <div class="detail-body">
                  <p class="eyebrow">
                    {t(
                      props.type === "movie"
                        ? "common.film"
                        : props.type === "anime"
                          ? "detail.anime"
                          : props.type === "drama"
                            ? "detail.drama"
                            : "common.series",
                    )}
                  </p>
                  <h1>{item().title}</h1>
                  <div class="facts">
                    <Show when={rating(item().rating)}>
                      <span class="score">
                        <Star /> {rating(item().rating)}
                      </span>
                    </Show>
                    <For each={facts()}>{(fact) => <span>{fact}</span>}</For>
                  </div>
                  <Show when={(item().genres ?? []).length}>
                    <div class="genres">
                      <For each={item().genres}>
                        {(genre) => <span class="chip">{genreName(genre)}</span>}
                      </For>
                    </div>
                  </Show>
                  <Show when={item().tagline}>
                    <p class="tagline">
                      <Translated text={item().tagline} />
                    </p>
                  </Show>
                  <p class="overview">
                    <Translated text={item().overview} />
                  </p>

                  <div class="row-actions">
                    <button
                      class="btn btn-primary"
                      onClick={() => play()}
                      disabled={props.type !== "movie" && !nextUp()}
                    >
                      <Play /> {playLabel()}
                    </button>
                    <Show when={item().trailers?.[0]?.key}>
                      <a
                        class="btn btn-ghost"
                        href={`https://www.youtube.com/watch?v=${item().trailers![0].key}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("detail.trailer")}
                      </a>
                    </Show>
                  </div>
                  <Show when={watchedFilm()}>
                    {(record) => (
                      <div
                        class="resume-bar"
                        aria-label={t("detail.watched", { percent: percent(record()) })}
                      >
                        <i style={{ width: `${percent(record())}%` }} />
                      </div>
                    )}
                  </Show>
                </div>
              </div>
            </section>

            <Show
              when={props.type === "anime" || props.type === "drama" || (item().seasons ?? []).length > 0}
            >
              <section class="section">
                <h2>{t("detail.episodes")}</h2>
                <div class="tabs">
                  <For each={(item().seasons ?? []).filter((entry) => entry.season_number > 0)}>
                    {(entry) => (
                      <button
                        class="tab"
                        data-active={seasonNumber() === entry.season_number || undefined}
                        onClick={() => setActiveSeason(entry.season_number)}
                      >
                        {seasonName(entry.name, entry.season_number)}
                      </button>
                    )}
                  </For>
                </div>

                <Show when={!episodesList.error} fallback={<State error>{t("detail.episodesError")}</State>}>
                  <Show
                    when={!episodesList.loading}
                    fallback={<State spinner>{t("detail.loadingEpisodes")}</State>}
                  >
                    <Show when={episodesList()?.length} fallback={<Empty title={t("detail.noEpisodes")} />}>
                      <div class="episodes">
                        <For each={episodesList()!}>
                          {(episode) => {
                            const watched = () => watchedEpisode(episode);
                            return (
                              <button class="episode" onClick={() => play(episode)}>
                                <div class="still">
                                  <Show when={episode.still}>
                                    <img src={episode.still!} alt="" loading="lazy" decoding="async" />
                                  </Show>
                                  <span class="still-play">
                                    <Play />
                                  </span>
                                  <Show when={watched()}>
                                    <div class="progress">
                                      <i style={{ width: `${percent(watched()!)}%` }} />
                                    </div>
                                  </Show>
                                </div>
                                <div class="episode-text">
                                  <div class="code">
                                    {t("detail.episode", { number: episode.episode_number })}
                                    <Show when={watched()}>
                                      <span class="watched">
                                        {" "}
                                        · {t("detail.watched", { percent: percent(watched()!) })}
                                      </span>
                                    </Show>
                                  </div>
                                  <strong>
                                    {episode.name || t("detail.episode", { number: episode.episode_number })}
                                  </strong>
                                  <Show when={episode.overview}>
                                    <p>
                                      <Translated text={episode.overview} />
                                    </p>
                                  </Show>
                                </div>
                              </button>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </Show>
                </Show>
              </section>
            </Show>

            <Show when={(item().cast ?? []).length}>
              <section class="section">
                <h2>{t("detail.cast")}</h2>
                <div class="cast">
                  <For each={(item().cast ?? []).slice(0, 16)}>
                    {(person) => (
                      <div class="person">
                        <div class="avatar">
                          <Show when={person.profile} fallback={<span>{person.name.slice(0, 1)}</span>}>
                            <img src={person.profile!} alt="" loading="lazy" decoding="async" />
                          </Show>
                        </div>
                        <strong>{person.name}</strong>
                        <Show when={person.character}>
                          <span>{person.character}</span>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </section>
            </Show>

            <Show when={clean(item().similar ?? item().recommendations ?? []).length}>
              <section class="section">
                <h2>{t("detail.more")}</h2>
                <div class="grid">
                  <For each={clean(item().similar ?? item().recommendations ?? []).slice(0, 12)}>
                    {(entry) => <Card item={entry} />}
                  </For>
                </div>
              </section>
            </Show>

            <footer class="foot">{t("detail.footer")}</footer>
          </>
        )}
      </Show>
    </Show>
  );
}
