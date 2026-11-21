import { useParams } from "@solidjs/router";
import { createResource, Show } from "solid-js";
import { details, season, type Episode } from "../lib/api";
import { episodeLabel } from "../lib/format";
import Player from "../components/Player";
import { t } from "../lib/i18n";
import { Back, State } from "../components/ui";

function Unavailable(props: { title: string; reason: unknown }) {
  return (
    <div class="wrap">
      <State error>
        <strong>{props.title}</strong>
        <span>{String((props.reason as Error)?.message ?? props.reason)}</span>
        <button class="btn btn-ghost" onClick={() => history.back()}>
          {t("common.back")}
        </button>
      </State>
    </div>
  );
}

/** The wait before the player appears. There is no top bar here, so it carries its own way out. */
function Opening(props: { children: string }) {
  return (
    <div class="opening">
      <button class="icon-btn" aria-label={t("common.back")} onClick={() => history.back()}>
        <Back />
      </button>
      <State spinner>{props.children}</State>
    </div>
  );
}

/** `#/watch/movie/:id` */
export function WatchMovie() {
  const params = useParams<{ id: string }>();
  const [found] = createResource(
    () => params.id,
    (id) => details("movie", id),
  );

  return (
    <Show
      when={found()}
      fallback={
        <Show when={found.error} fallback={<Opening>{t("watch.openingFilm")}</Opening>}>
          <Unavailable title={t("watch.filmError")} reason={found.error} />
        </Show>
      }
    >
      {(item) => (
        <Player
          type="movie"
          id={params.id}
          title={item().title}
          poster={item().poster ?? item().backdrop}
          backdrop={item().backdrop}
          subtitle={item().year ?? undefined}
        />
      )}
    </Show>
  );
}

/** `#/watch/episode/:seriesId/:season/:episode` */
export function WatchEpisode() {
  const params = useParams<{ seriesId: string; season: string; episode: string }>();
  const seasonNumber = () => Number(params.season);
  const episodeNumber = () => Number(params.episode);

  const [found] = createResource(
    // The episode is part of the key: moving to the next one must refresh its name and what follows.
    () => ({ id: params.seriesId, season: seasonNumber(), episode: episodeNumber() }),
    async (query) => {
      const [show, current] = await Promise.all([details("tv", query.id), season(query.id, query.season)]);
      const episodes = current.episodes ?? [];
      const episode = episodes.find((entry) => entry.episode_number === query.episode);
      if (!episode) throw new Error(`episode ${query.episode} is not listed`);
      const following = episodes.find((entry) => entry.episode_number === query.episode + 1);
      return { show, episode, next: following };
    },
  );

  return (
    <Show
      when={found()}
      fallback={
        <Show when={found.error} fallback={<Opening>{t("watch.openingEpisode")}</Opening>}>
          <Unavailable title={t("watch.episodeError")} reason={found.error} />
        </Show>
      }
    >
      {(data) => (
        <Player
          type="tv"
          id={params.seriesId}
          title={data().show.title}
          poster={data().show.poster ?? data().show.backdrop}
          backdrop={data().show.backdrop}
          subtitle={`${episodeLabel(seasonNumber(), episodeNumber())} · ${(data().episode as Episode).name ?? "Episode"}`}
          seasonNumber={seasonNumber()}
          episodeNumber={episodeNumber()}
          next={
            data().next
              ? {
                  season: seasonNumber(),
                  episode: episodeNumber() + 1,
                  label: episodeLabel(seasonNumber(), episodeNumber() + 1),
                }
              : null
          }
          nextHref={
            data().next
              ? `/watch/episode/${params.seriesId}/${seasonNumber()}/${episodeNumber() + 1}`
              : undefined
          }
        />
      )}
    </Show>
  );
}
