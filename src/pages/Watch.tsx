import { useParams } from "@solidjs/router";
import { createResource, Show } from "solid-js";
import { details, season, type Episode } from "../lib/api";
import {
  animeDetails,
  animeEpisodes,
  animeStreams,
  dramaDetails,
  dramaEpisodes,
  dramaStreams,
} from "../lib/sources";
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

type Kind = "tv" | "anime" | "drama";

const loadShow = async (kind: Kind, id: string) => {
  if (kind === "anime") return animeDetails(id);
  if (kind === "drama") return dramaDetails(id);
  return details("tv", id);
};

const loadEpisodes = async (kind: Kind, id: string, seasonNumber: number) => {
  if (kind === "anime") return animeEpisodes(id);
  if (kind === "drama") return dramaEpisodes(id);
  return season(id, seasonNumber);
};

/** `#/watch/episode/:kind/:seriesId/:season/:episode` */
export function WatchEpisode() {
  const params = useParams<{ kind: string; seriesId: string; season: string; episode: string }>();
  const kind = (): Kind => (params.kind === "anime" || params.kind === "drama" ? params.kind : "tv");
  const seasonNumber = () => Number(params.season);
  const episodeNumber = () => Number(params.episode);
  /** A single-season source (anime, dramas) reads better as "Episode 5" than "S1E5". */
  const code = (number: number) =>
    kind() === "tv" ? episodeLabel(seasonNumber(), number) : t("detail.episode", { number });

  const [found] = createResource(
    // The episode is part of the key: moving to the next one must refresh its name and what follows.
    () => ({ id: params.seriesId, season: seasonNumber(), episode: episodeNumber() }),
    async (query) => {
      const [show, current] = await Promise.all([
        loadShow(kind(), query.id),
        loadEpisodes(kind(), query.id, query.season),
      ]);
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
          kind={kind()}
          id={params.seriesId}
          title={data().show.title}
          poster={data().show.poster ?? data().show.backdrop}
          backdrop={data().show.backdrop}
          subtitle={
            kind() === "tv"
              ? `${code(episodeNumber())} · ${(data().episode as Episode).name ?? code(episodeNumber())}`
              : code(episodeNumber())
          }
          seasonNumber={seasonNumber()}
          episodeNumber={episodeNumber()}
          next={
            data().next
              ? {
                  season: seasonNumber(),
                  episode: episodeNumber() + 1,
                  label: code(episodeNumber() + 1),
                }
              : null
          }
          nextHref={
            data().next
              ? `/watch/episode/${kind()}/${params.seriesId}/${seasonNumber()}/${episodeNumber() + 1}`
              : undefined
          }
        />
      )}
    </Show>
  );
}
