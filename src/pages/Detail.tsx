import { A, useNavigate } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { clean, episodeLabel, rating, runtime, year } from "../lib/format";
import { details, season as fetchSeason, type Episode, type MediaType } from "../lib/api";
import { getProgress } from "../lib/store";
import { Card, Empty, Play, State } from "../components/ui";

type Props = { type: MediaType; id: string };

export default function Detail(props: Props) {
  const navigate = useNavigate();
  const [found] = createResource(() => ({ type: props.type, id: props.id }), (query) =>
    details(query.type, query.id),
  );

  const [activeSeason, setActiveSeason] = createSignal<number | null>(null);
  const seasonNumber = () => activeSeason() ?? found()?.seasons?.find((entry) => entry.season_number > 0)?.season_number ?? 1;

  const [episodesList] = createResource(
    () => (props.type === "tv" ? { id: props.id, season: seasonNumber() } : null),
    async (query) => (await fetchSeason(query.id, query.season)).episodes ?? [],
  );

  const facts = createMemo(() => {
    const item = found();
    if (!item) return [];
    return [year(item.release_date), runtime(item.runtime), rating(item.rating) && `★ ${rating(item.rating)}`, item.genres?.join(", ")]
      .filter(Boolean) as string[];
  });

  const nextUp = () => {
    const list = episodesList() ?? [];
    const started = list.find((episode) => getProgress("episode", String(episode.id)));
    return started ?? list[0];
  };

  const play = (episode?: Episode) => {
    if (props.type === "movie") return void navigate(`/watch/movie/${props.id}`);
    const target = episode ?? nextUp();
    if (target) navigate(`/watch/episode/${props.id}/${target.season_number}/${target.episode_number}`);
  };

  return (
    <Show
      when={!found.error}
      fallback={
        <div class="wrap">
          <State error>
            <strong>Could not load this title</strong>
            <span>{String(found.error?.message ?? found.error)}</span>
            <A class="btn btn-ghost" href="/">Back home</A>
          </State>
        </div>
      }
    >
      <Show when={found()} fallback={<State spinner>Loading…</State>}>
        {(item) => (
          <>
            <section class="detail detail-hero">
              <Show when={item().backdrop}>
                <div class="detail-art" style={{ "background-image": `url("${item().backdrop}")` }} />
              </Show>

              <div class="detail-grid">
                <div class="detail-poster" style={item().poster ? { "background-image": `url("${item().poster}")` } : undefined} />

                <div>
                  <div class="facts">
                    <span class="chip">{props.type === "movie" ? "Film" : "Series"}</span>
                    <For each={facts()}>{(fact) => <span class="dot">{fact}</span>}</For>
                  </div>
                  <h1>{item().title}</h1>
                  <Show when={item().tagline}>
                    <p class="tagline">{item().tagline}</p>
                  </Show>
                  <p class="overview">{item().overview}</p>

                  <div class="row-actions">
                    <button class="btn btn-primary" onClick={() => play()} disabled={props.type === "tv" && !nextUp()}>
                      <Play /> {props.type === "movie" ? "Play" : "Play first episode"}
                    </button>
                    <Show when={item().trailers?.[0]?.key}>
                      <a
                        class="btn btn-ghost"
                        href={`https://www.youtube.com/watch?v=${item().trailers![0].key}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Trailer
                      </a>
                    </Show>
                  </div>

                  <Show when={(item().cast ?? []).length}>
                    <div class="cast">
                      <For each={(item().cast ?? []).slice(0, 12)}>
                        {(person) => (
                          <span>
                            {person.name}
                            {person.character ? ` · ${person.character}` : ""}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>
            </section>

            <Show when={props.type === "tv" && (item().seasons ?? []).length}>
              <section class="section">
                <h2>Episodes</h2>
                <div class="tabs">
                  <For each={(item().seasons ?? []).filter((entry) => entry.season_number > 0)}>
                    {(entry) => (
                      <button
                        class="tab"
                        data-active={seasonNumber() === entry.season_number || undefined}
                        onClick={() => setActiveSeason(entry.season_number)}
                      >
                        {entry.name || `Season ${entry.season_number}`}
                      </button>
                    )}
                  </For>
                </div>

                <Show when={!episodesList.error} fallback={<State error>Could not load episodes.</State>}>
                  <Show when={!episodesList.loading} fallback={<State spinner>Loading episodes…</State>}>
                    <Show when={episodesList()?.length} fallback={<Empty title="No episodes for this season" />}>
                      <div class="episodes">
                        <For each={episodesList()!}>
                          {(episode) => {
                            const watched = () => getProgress("episode", String(episode.id));
                            return (
                              <button class="episode" onClick={() => play(episode)}>
                                <div
                                  class="still"
                                  style={episode.still ? { "background-image": `url("${episode.still}")` } : undefined}
                                />
                                <div>
                                  <div class="code">{episodeLabel(episode.season_number, episode.episode_number)}</div>
                                  <strong>{episode.name || `Episode ${episode.episode_number}`}</strong>
                                  <p>{episode.overview}</p>
                                </div>
                                <Show when={watched()}>
                                  <span class="watched">
                                    {Math.min(99, Math.round((watched()!.positionSeconds / Math.max(1, watched()!.durationSeconds)) * 100))}% watched
                                  </span>
                                </Show>
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

            <Show when={clean(item().similar ?? item().recommendations ?? []).length}>
              <section class="section">
                <h2>You might also like</h2>
                <div class="grid">
                  <For each={clean(item().similar ?? item().recommendations ?? []).slice(0, 12)}>
                    {(entry) => <Card item={entry} />}
                  </For>
                </div>
              </section>
            </Show>

            <footer class="foot">Plays in Catflix, without ads.</footer>
          </>
        )}
      </Show>
    </Show>
  );
}
