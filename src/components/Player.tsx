import Hls from "hls.js";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { streams, type MediaType, type Source, type Streams, type Subtitle } from "../lib/api";
import { streamUrl } from "../lib/format";
import { clearProgress, getProgress, loadPrefs, savePrefs, saveProgress } from "../lib/store";
import { Back, Close, Expand, Muted, Next, Pause, Play, Volume } from "../components/ui";

export type PlayerProps = {
  type: MediaType;
  id: string;
  title: string;
  /** Poster of the film or series, remembered for "Continue watching". */
  poster?: string | null;
  subtitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  /** Next episode to offer when this one ends. */
  next?: { season: number; episode: number; label: string } | null;
  nextHref?: string;
};

const clock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const rest = Math.floor((total % 3600) / 60);
  const tail = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(rest).padStart(2, "0")}:${tail}` : `${rest}:${tail}`;
};

/** Where the watch state is keyed: one record per episode, one per film. */
const watchKey = (props: PlayerProps) =>
  props.type === "movie"
    ? `movie:${props.id}`
    : `episode:${props.id}:${props.seasonNumber}:${props.episodeNumber}`;

export default function Player(props: PlayerProps) {
  let video!: HTMLVideoElement;
  let hls: Hls | null = null;
  let idleTimer = 0;
  let heartbeat = 0;
  let pollTimer = 0;
  let ticker = 0;

  const [stage, setStage] = createSignal<"loading" | "ready" | "error" | "ended">("loading");
  const [message, setMessage] = createSignal("");
  const [offline, setOffline] = createSignal<string>("");
  const [payload, setPayload] = createSignal<Streams | null>(null);
  const [source, setSource] = createSignal<Source | null>(null);
  const [subtitles, setSubtitles] = createSignal<Subtitle[]>([]);
  const [track, setTrack] = createSignal(-1);
  const [levels, setLevels] = createSignal<{ index: number; height: number }[]>([]);
  const [level, setLevel] = createSignal(-1);
  const [playing, setPlaying] = createSignal(false);
  const [muted, setMuted] = createSignal(false);
  const [volume, setVolume] = createSignal(1);
  const [position, setPosition] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [buffered, setBuffered] = createSignal(0);
  const [idle, setIdle] = createSignal(false);
  const [needsTap, setNeedsTap] = createSignal(false);

  // Recomputed when the player is reused for another episode.
  const key = () => watchKey(props);
  const resumeFrom = createMemo(() => {
    const [type, ...rest] = key().split(":");
    return getProgress(type, rest.join(":"))?.positionSeconds ?? 0;
  });
  const remember = (position: number, total: number) => {
    const [type, ...rest] = key().split(":");
    saveProgress(type, rest.join(":"), position, total, { title: props.title, poster: props.poster });
  };
  const forget = () => {
    const [type, ...rest] = key().split(":");
    clearProgress(type, rest.join(":"));
  };

  const wake = () => {
    setIdle(true);
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => setIdle(false), 2600);
  };

  const fail = (reason: string) => {
    setStage("error");
    setMessage(reason);
  };

  const destroyStream = () => {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    video.removeAttribute("src");
    video.load();
  };

  /** Play one source, resuming where this title was left. */
  const play = (chosen: Source, from: number) => {
    destroyStream();
    setSource(chosen);
    setLevels([]);
    setLevel(-1);
    const url = streamUrl(chosen);

    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, maxBufferLength: 40, backBufferLength: 30 });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(
          (hls?.levels ?? [])
            .map((entry, index) => ({ index, height: entry.height }))
            .filter((entry) => entry.height > 0)
            .sort((a, b) => b.height - a.height),
        );
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        if (hls) setLevel(hls.autoLevelEnabled ? -1 : data.level);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          void refetch(video?.currentTime ?? from);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
        } else {
          fail("this source stopped working");
        }
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url;
    }

    setStage("ready");
    const once = () => {
      video.removeEventListener("loadedmetadata", once);
      if (from > 0) video.currentTime = from;
      void video.play().catch(() => setNeedsTap(true));
    };
    video.addEventListener("loadedmetadata", once);
  };

  /** Ask the API again (links expire, sources go down). */
  const refetch = async (from: number) => {
    setStage("loading");
    setPayload(null);
    setSubtitles([]);
    setTrack(-1);
    setMessage("Finding a working source…");
    try {
      const fresh = await streams(props.type, props.id, props.seasonNumber, props.episodeNumber);
      const usable = (fresh.sources ?? []).filter((entry) => entry.url);
      if (!usable.length) {
        setOffline("no source");
        fail("No working source for this title right now. Try again in a moment.");
        return;
      }
      setOffline("");
      setPayload(fresh);
      setSubtitles(fresh.subtitles ?? []);
      play(usable[0], from);
    } catch (error) {
      fail(String((error as Error).message ?? error));
    }
  };

  /* ---- player controls ---- */

  const toggle = () => {
    wake();
    if (video.paused) void video.play().catch(() => setNeedsTap(true));
    else video.pause();
  };

  const seek = (fraction: number) => {
    if (!duration()) return;
    video.currentTime = Math.min(Math.max(fraction, 0), 1) * duration();
    remember(video.currentTime, duration());
  };

  const toggleMute = () => {
    video.muted = !video.muted;
    savePrefs({ muted: video.muted });
  };

  const pickLevel = (index: number) => {
    setLevel(index);
    if (hls) hls.currentLevel = index;
  };

  const pickTrack = (index: number) => {
    setTrack(index);
    Array.from(video.textTracks).forEach((node, position) => {
      node.mode = position === index ? "showing" : "disabled";
    });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.querySelector(".player")?.requestFullscreen();
  };

  const goNext = () => {
    if (props.nextHref) window.location.hash = `#${props.nextHref}`;
  };

  const onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
    const actions: Record<string, () => void> = {
      " ": toggle,
      k: toggle,
      ArrowRight: () => (video.currentTime += 10),
      ArrowLeft: () => (video.currentTime -= 10),
      ArrowUp: () => (video.volume = Math.min(1, video.volume + 0.05)),
      ArrowDown: () => (video.volume = Math.max(0, video.volume - 0.05)),
      f: toggleFullscreen,
      m: toggleMute,
      Escape: () => history.back(),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
      wake();
    }
  };

  /** Load a stream for the current episode. */
  const load = () => void refetch(resumeFrom());

  onMount(() => {
    // A new episode reuses this component, so reload when the key moves.
    createEffect(() => {
      key();
      load();
    });
    const prefs = loadPrefs();
    video.volume = prefs.volume ?? 1;
    video.muted = prefs.muted ?? false;

    const sync = () => {
      setPosition(video.currentTime);
      if (Number.isFinite(video.duration)) setDuration(video.duration);
    };
    const onPlay = () => {
      setPlaying(true);
      setNeedsTap(false);
    };
    const onPause = () => setPlaying(false);
    const onVolume = () => {
      setVolume(video.volume);
      setMuted(video.muted);
      savePrefs({ volume: video.volume, muted: video.muted });
    };
    const onEnded = () => {
      setStage("ended");
      remember(video.duration || 0, video.duration || 0);
    };

    video.addEventListener("timeupdate", sync);
    video.addEventListener("durationchange", sync);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolume);
    video.addEventListener("ended", onEnded);
    window.addEventListener("keydown", onKey);
    wake();

    heartbeat = window.setInterval(() => {
      if (video.currentTime > 0 && Number.isFinite(video.duration) && !video.paused) {
        remember(video.currentTime, video.duration);
      }
    }, 5000);

    ticker = window.setInterval(() => {
      try {
        setBuffered(video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0);
      } catch {
        /* ignore */
      }
    }, 1000);

    // Sources expire after a while; refresh ahead of the stall.
    pollTimer = window.setInterval(() => {
      if (stage() === "ready" && video.currentTime > 0) void refetch(video.currentTime);
    }, 45 * 60_000);

  });

  onCleanup(() => {
    clearInterval(heartbeat);
    clearInterval(ticker);
    clearInterval(pollTimer);
    clearTimeout(idleTimer);
    window.removeEventListener("keydown", onKey);
    if (Number.isFinite(video.duration) && video.currentTime > 2) {
      remember(video.currentTime, video.duration);
    }
    destroyStream();
  });

  return (
    <div class="player" data-idle={idle()}>
      <div class="player-bar">
        <button class="icon-btn" aria-label="Back" onClick={() => history.back()}>
          <Back />
        </button>
        <div>
          <h2>{props.title}</h2>
          <Show when={props.subtitle}>
            <p>{props.subtitle}</p>
          </Show>
        </div>
        <span style={{ flex: 1 }} />
        <button class="icon-btn" aria-label="Close" onClick={() => history.back()}>
          <Close />
        </button>
      </div>

      <div class="stage" onMouseMove={wake} onClick={toggle} style={{ cursor: idle() ? "none" : "default" }}>
        <video ref={video} playsinline onContextMenu={(event) => event.preventDefault()} />

        <Show when={stage() === "loading"}>
          <div class="overlay">
            <div class="spinner" />
            <h3>{message() || "Preparing…"}</h3>
          </div>
        </Show>

        <Show when={stage() === "error"}>
          <div class="overlay">
            <h3>Playback failed</h3>
            <p>{message()}</p>
            <div class="row-actions">
              <button
                class="btn btn-primary"
                onClick={() => {
                  setOffline("");
                  void refetch(resumeFrom());
                }}
              >
                Try another source
              </button>
              <button class="btn btn-ghost" onClick={() => history.back()}>
                Back
              </button>
            </div>
          </div>
        </Show>

        <Show when={needsTap() && stage() === "ready" && !playing()}>
          <div class="overlay" onClick={toggle}>
            <h3>Tap to start</h3>
            <p>The browser held autoplay back for this stream.</p>
          </div>
        </Show>

        <Show when={stage() === "ended"}>
          <div class="overlay">
            <h3>Finished</h3>
            <p>{props.title}</p>
            <div class="row-actions">
              <button
                class="btn btn-ghost"
                onClick={() => {
                  forget();
                  video.currentTime = 0;
                  void video.play();
                  setStage("ready");
                }}
              >
                Play again
              </button>
              <Show when={props.next}>
                <button class="btn btn-primary" onClick={goNext}>
                  <Next /> Next: {props.next!.label}
                </button>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      <div class="player-foot" onMouseMove={wake}>
        <Show when={(payload()?.sources ?? []).length > 1}>
          <div class="sources">
            <For each={payload()?.sources ?? []}>
              {(entry) => (
                <button
                  data-active={source()?.url === entry.url || undefined}
                  onClick={() => play(entry, video.currentTime)}
                  title={entry.server}
                >
                  {entry.server ?? "Source"}
                  <Show when={entry.quality}> · {entry.quality}</Show>
                </button>
              )}
            </For>
          </div>
        </Show>

        <div
          class="timeline"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            seek((event.clientX - box.left) / box.width);
          }}
        >
          <div class="track">
            <div class="buffered" style={{ width: `${duration() ? (buffered() / duration()) * 100 : 0}%` }} />
            <div class="fill" style={{ width: `${duration() ? (position() / duration()) * 100 : 0}%` }} />
          </div>
        </div>

        <div class="controls">
          <button class="icon-btn" aria-label={playing() ? "Pause" : "Play"} onClick={toggle}>
            <Show when={playing()} fallback={<Play />}>
              <Pause />
            </Show>
          </button>
          <button class="icon-btn" aria-label={muted() ? "Unmute" : "Mute"} onClick={toggleMute}>
            <Show when={muted() || volume() === 0} fallback={<Volume />}>
              <Muted />
            </Show>
          </button>
          <span class="time">
            {clock(position())} / {clock(duration())}
          </span>
          <span class="grow" />

          <Show when={subtitles().length}>
            <select class="menu" value={track()} onChange={(event) => pickTrack(Number(event.currentTarget.value))} aria-label="Subtitles">
              <option value={-1}>Subtitles off</option>
              <For each={subtitles()}>
                {(entry, index) => <option value={index()}>{entry.label ?? entry.language ?? entry.lang}</option>}
              </For>
            </select>
          </Show>

          <Show when={levels().length > 1}>
            <select class="menu" value={level()} onChange={(event) => pickLevel(Number(event.currentTarget.value))} aria-label="Quality">
              <option value={-1}>Auto</option>
              <For each={levels()}>{(entry) => <option value={entry.index}>{entry.height}p</option>}</For>
            </select>
          </Show>

          <Show when={props.next}>
            <button class="icon-btn" aria-label="Next episode" onClick={goNext}>
              <Next />
            </button>
          </Show>
          <button class="icon-btn" aria-label="Fullscreen" onClick={toggleFullscreen}>
            <Expand />
          </button>
        </div>
      </div>

      <For each={subtitles()}>
        {(entry, index) => (
          <track
            kind="subtitles"
            label={entry.label ?? entry.language ?? entry.lang}
            srclang={(entry.lang ?? "en").slice(0, 2)}
            src={entry.url}
            default={index() === 0 && track() === 0}
          />
        )}
      </For>
    </div>
  );
}
