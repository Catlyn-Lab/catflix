import Hls from "hls.js";
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { streams, type MediaType, type Source, type Streams, type Subtitle } from "../lib/api";
import { animeStreams, dramaStreams } from "../lib/sources";
import {
  alternativeSubtitles,
  asSubtitle,
  generatedFor,
  generatedStatus,
  type Generated,
} from "../lib/subtitles";
import SubtitleMaker from "./SubtitleMaker";
import { takeVideo } from "../lib/media";
import { cueAt, loadCues, type Cue } from "../lib/captions";
import { isBackKey, isTouch, usesDpad } from "../lib/device";
import { streamUrl } from "../lib/format";
import { language, matchesLanguage, t } from "../lib/i18n";
import { directionOf, moveFocus } from "../lib/spatial";
import { clearProgress, getProgress, loadPrefs, savePrefs, saveProgress } from "../lib/store";
import {
  Back,
  Captions,
  Check,
  SparkleIcon,
  Close,
  Compress,
  Expand,
  Muted,
  Next,
  Pause,
  Pip,
  Play,
  SkipBack,
  SkipForward,
  Sliders,
  Volume,
} from "../components/ui";

export type PlayerProps = {
  type: MediaType;
  /** Which catalogue a series came from; `tv` when unset. */
  kind?: "tv" | "anime" | "drama";
  id: string;
  title: string;
  /** Poster of the film or series, remembered for "Continue watching". */
  poster?: string | null;
  /** Wide artwork shown behind the player while a stream is being found. */
  backdrop?: string | null;
  subtitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  /** Next episode to offer when this one ends. */
  next?: { season: number; episode: number; label: string } | null;
  nextHref?: string;
};

type Panel = "quality" | "subtitles" | "audio" | "speed" | "source";
/** `action`: a command rather than a choice (drawn as a button, apart from the choices). */
type Option = { label: string; hint?: string; active: boolean; action?: boolean; pick: () => void };

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SKIP = 10;
const HIDE_AFTER = 3200;
const NEXT_AFTER = 8;

const clock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const rest = Math.floor((total % 3600) / 60);
  const tail = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(rest).padStart(2, "0")}:${tail}` : `${rest}:${tail}`;
};

const clamp = (value: number, low = 0, high = 1) => Math.min(Math.max(value, low), high);

/** "Subtitles • English (2)" reads better as "English (2)" under a Subtitles heading. */
/** The line some sites put into their subtitle files when they are shown outside their own pages. */
const NOTICE = /surreptitiously using content|support the original site/i;

const captionName = (entry: Subtitle) =>
  (entry.label ?? entry.language ?? entry.lang ?? "Subtitles").replace(/^subtitles?\s*[•·:–-]\s*/i, "");

/** Where the watch state is keyed: one record per episode, one per film. */
const watchKey = (props: PlayerProps) =>
  props.type === "movie"
    ? `movie:${props.id}`
    : `episode:${props.kind && props.kind !== "tv" ? `${props.kind}:` : ""}${props.id}:${props.seasonNumber}:${props.episodeNumber}`;

export default function Player(props: PlayerProps) {
  let root!: HTMLDivElement;
  const video = takeVideo();
  video.addEventListener("contextmenu", (event) => event.preventDefault());
  let sheet: HTMLDivElement | undefined;
  let playButton: HTMLButtonElement | undefined;
  let hls: Hls | null = null;
  let idleTimer = 0;
  let heartbeat = 0;
  let pollTimer = 0;
  let ticker = 0;
  let captionTicker = 0;
  let toastTimer = 0;
  let rippleTimer = 0;
  let countdownTimer = 0;
  let lastTap = 0;
  let pointerKind = "mouse";
  /** Subtitle language to pick again after the sources are refreshed. */
  let wantedCaption = "";
  /** The "no Indonesian subtitles" notice is shown once per title. */
  let fallbackNoticed = false;
  let pendingNotice = "";
  /** Sources that have already failed since the list was last fetched. */
  const tried = new Set<string>();
  /** Where playback stood when the sources were last fetched. */
  let fetchedAt = 0;
  let mediaRecoveries = 0;

  const [stage, setStage] = createSignal<"loading" | "ready" | "error" | "ended">("loading");
  const [message, setMessage] = createSignal("");
  const [payload, setPayload] = createSignal<Streams | null>(null);
  const [source, setSource] = createSignal<Source | null>(null);
  const [subtitles, setSubtitles] = createSignal<Subtitle[]>([]);
  const [track, setTrack] = createSignal(-1);
  const [cues, setCues] = createSignal<Cue[]>([]);
  const [caption, setCaption] = createSignal("");
  const [levels, setLevels] = createSignal<{ index: number; height: number }[]>([]);
  const [level, setLevel] = createSignal(-1);
  const [autoHeight, setAutoHeight] = createSignal(0);
  const [audioTracks, setAudioTracks] = createSignal<{ index: number; label: string }[]>([]);
  const [audio, setAudio] = createSignal(-1);
  const [speed, setSpeed] = createSignal(1);
  const [playing, setPlaying] = createSignal(false);
  const [waiting, setWaiting] = createSignal(false);
  const [muted, setMuted] = createSignal(false);
  const [volume, setVolume] = createSignal(1);
  const [position, setPosition] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [buffered, setBuffered] = createSignal(0);
  const [active, setActive] = createSignal(true);
  const [needsTap, setNeedsTap] = createSignal(false);
  const [scrub, setScrub] = createSignal<number | null>(null);
  const [hover, setHover] = createSignal<number | null>(null);
  const [panel, setPanel] = createSignal<Panel | null>(null);
  /** The "Create subtitle" form, shown in place of the subtitle list. */
  const [maker, setMaker] = createSignal(false);
  /** Seconds the subtitles are moved by (later when positive), for files timed for another release. */
  const [shift, setShift] = createSignal(0);
  const moveSubtitles = (by: number) => {
    const next = Math.round((shift() + by) * 10) / 10;
    setShift(next);
    say(
      next
        ? t("player.subtitleShift", { seconds: next > 0 ? `+${next}` : String(next) })
        : t("player.subtitleInSync"),
      1500,
    );
  };
  const [fullscreen, setFullscreen] = createSignal(false);
  const [toast, setToast] = createSignal("");
  const [ripple, setRipple] = createSignal<"back" | "forward" | null>(null);
  const [countdown, setCountdown] = createSignal<number | null>(null);

  const canPip = "pictureInPictureEnabled" in document && document.pictureInPictureEnabled;

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

  /* ---- chrome visibility ---- */

  const mayHide = () => playing() && !panel() && scrub() === null && stage() === "ready";

  const hide = () => {
    if (!mayHide()) return;
    setActive(false);
    // Nothing stays focused behind hidden controls.
    const focused = document.activeElement as HTMLElement | null;
    if (focused && focused !== document.body && root.contains(focused)) focused.blur();
  };

  const wake = () => {
    setActive(true);
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(hide, HIDE_AFTER);
  };

  const say = (text: string, forMs = 1100) => {
    setToast(text);
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setToast(""), forMs);
  };

  const fail = (reason: string) => {
    setStage("error");
    setMessage(reason);
  };

  const stopCountdown = () => {
    clearInterval(countdownTimer);
    setCountdown(null);
  };

  /* ---- stream ---- */

  const destroyStream = () => {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    video.onerror = null;
    video.removeAttribute("src");
    video.load();
  };

  const readAudioTracks = () => {
    if (!hls) return;
    setAudioTracks(
      hls.audioTracks.map((entry, index) => ({
        index,
        label: entry.name || entry.lang || t("player.trackNumber", { number: index + 1 }),
      })),
    );
    setAudio(hls.audioTrack);
  };

  /**
   * A source broke. Move to the next one that has not failed yet. Only when every source has
   * failed is the list fetched again, and only if the film actually played since the last fetch
   * (links expire mid-film). Otherwise stop and say so, rather than retrying for ever.
   */
  const giveUpOn = (broken: Source, at: number) => {
    if (source()?.url !== broken.url) return;
    tried.add(broken.url);
    const next = (payload()?.sources ?? []).find((entry) => entry.url && !tried.has(entry.url));
    if (next) {
      play(next, at);
    } else if (at > fetchedAt + 5) {
      void refetch(at);
    } else {
      destroyStream();
      fail(t("player.noSource"));
    }
  };

  /** True while the player muted itself to be allowed to start; the viewer's setting is untouched. */
  let autoMuted = false;

  /**
   * Start playback. The webview refuses sound unless playback follows a click directly, and here
   * it follows the stream lookup instead; so when sound is refused, start muted and say so. Only
   * if even that is refused does the viewer get the "tap to play" button.
   */
  const start = async () => {
    try {
      await video.play();
    } catch (error) {
      if ((error as DOMException)?.name !== "NotAllowedError" || video.muted) {
        setNeedsTap(true);
        return;
      }
      autoMuted = true;
      video.muted = true;
      try {
        await video.play();
        say(t("player.autoMuted"), 4000);
      } catch {
        autoMuted = false;
        video.muted = false;
        setNeedsTap(true);
      }
    }
  };

  /** Play one source, resuming where this title was left. */
  const play = (chosen: Source, from: number) => {
    destroyStream();
    setSource(chosen);
    mediaRecoveries = 0;
    setLevels([]);
    setLevel(-1);
    setAutoHeight(0);
    setAudioTracks([]);
    setAudio(-1);
    const url = streamUrl(chosen);

    // hls.js only for playlists; a plain MP4 file goes straight to the video element.
    const isPlaylist = chosen.type === "hls" || /\.m3u8(\?|$)/i.test(chosen.url);
    if (isPlaylist && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, maxBufferLength: 40, backBufferLength: 30 });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(
          (hls?.levels ?? [])
            .map((entry, index) => ({ index, height: entry.height }))
            .filter((entry) => entry.height > 0)
            .sort((a, b) => b.height - a.height),
        );
        readAudioTracks();
      });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, readAudioTracks);
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, readAudioTracks);
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        if (!hls) return;
        setLevel(hls.autoLevelEnabled ? -1 : data.level);
        setAutoHeight(hls.levels[data.level]?.height ?? 0);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        // A decoding hiccup is worth two recoveries; after that the source counts as broken.
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
          mediaRecoveries++;
          hls?.recoverMediaError();
          return;
        }
        giveUpOn(chosen, video?.currentTime || from);
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url;
      video.onerror = () => giveUpOn(chosen, video.currentTime || from);
    }

    setStage("ready");
    const once = () => {
      video.removeEventListener("loadedmetadata", once);
      if (from > 0) video.currentTime = from;
      video.playbackRate = speed();
      void start();
    };
    video.addEventListener("loadedmetadata", once);
  };

  /** The subtitle file in the viewer's language, or English when there is none. */
  const bestCaption = (list: Subtitle[]) => {
    const wanted = language();
    const exact = list.findIndex((entry) => matchesLanguage(entry, wanted));
    if (exact >= 0 || wanted === "en") return exact;
    return list.findIndex((entry) => matchesLanguage(entry, "en"));
  };

  /** Which subtitles to switch on when a title starts: -1 for none. */
  const preferredCaption = (list: Subtitle[]) => {
    if (loadPrefs().subtitlesOff) return -1;
    // A file the viewer picked by hand wins while it is still on offer.
    if (wantedCaption) {
      const again = list.findIndex((entry) => captionName(entry) === wantedCaption);
      if (again >= 0) return again;
    }
    const best = bestCaption(list);
    const wanted = language();
    if (best >= 0 && wanted !== "en" && !matchesLanguage(list[best], wanted) && !fallbackNoticed) {
      fallbackNoticed = true;
      // Held until the picture is up, so it is not lost behind the loading screen.
      pendingNotice = t("player.noIndonesian");
    }
    return best;
  };

  /** The title's own subtitles: the ones a new subtitle can be made from. */
  const sources = () =>
    subtitles().filter((entry) => !entry.generated && !replaced().has(entry.source ?? entry.url));
  const percentOf = (entry: Subtitle) =>
    entry.generated?.total ? Math.floor((entry.generated.done / entry.generated.total) * 100) : 0;

  /** A subtitle was made (or found ready-made): add it and show it. */
  const addGenerated = (made: Generated) => {
    const list = subtitles();
    const at = list.findIndex((entry) => entry.generated?.id === made.id);
    const index = at >= 0 ? at : list.length;
    if (at < 0) setSubtitles([...list, asSubtitle(made)]);
    setMaker(false);
    closePanel();
    pickTrack(index);
  };

  /* While a picked subtitle is still being made, fetch what is ready every few seconds. */
  let generatedTimer = 0;
  createEffect(
    on(track, (index) => {
      clearInterval(generatedTimer);
      const entry = subtitles()[index];
      if (entry?.generated?.status !== "working") return;
      const id = entry.generated.id;
      generatedTimer = window.setInterval(async () => {
        const made = await generatedStatus(id).catch(() => null);
        if (!made || track() !== index) return;
        setSubtitles((list) => list.map((item) => (item.generated?.id === id ? asSubtitle(made) : item)));
        const cues = await loadCues(made.url, true).catch(() => null);
        if (cues && track() === index) setCues(cues);
        if (made.status !== "working") {
          clearInterval(generatedTimer);
          if (made.status === "failed") say(t("maker.failed"), 3000);
        }
      }, 4000);
    }),
  );
  onCleanup(() => clearInterval(generatedTimer));

  /** Subtitle files found to carry their site's notice against showing them elsewhere. */
  const noticed = new Set<string>();
  /** Files that are nothing but that notice: no subtitles at all, as far as Catflix is concerned. */
  const [replaced, setReplaced] = createSignal<ReadonlySet<string>>(new Set());
  let replacedNoticed = false;
  /** The best other track for the one at `index`: same language first, then English. */
  const otherTrack = (index: number) => {
    const list = subtitles();
    const current = list[index];
    const languageOf = (entry: Subtitle) =>
      (entry.lang || captionName(entry)).toLowerCase().split(/[\s_-]/)[0];
    const open = list
      .map((entry, at) => ({ entry, at }))
      .filter(({ entry, at }) => at !== index && !noticed.has(entry.url));
    return (
      (
        open.find(({ entry }) => current && languageOf(entry) === languageOf(current)) ??
        open.find(({ entry }) => matchesLanguage(entry, "en"))
      )?.at ?? -1
    );
  };

  /** Show one subtitle file, or none. A choice made by the viewer is remembered. */
  const pickTrack = (index: number, byViewer = true) => {
    setTrack(index);
    setShift(0);
    setCues([]);
    setCaption("");
    const entry = subtitles()[index];
    if (byViewer) {
      wantedCaption = entry ? captionName(entry) : "";
      savePrefs({ subtitlesOff: !entry });
    }
    if (!entry) return;
    loadCues(entry.url, Boolean(entry.generated))
      .then((loaded) => {
        if (track() !== index) return;
        // Chosen automatically but the file carries its site's "not allowed here" notice: prefer
        // another track in the same language, or English. A viewer's own choice is kept as it is.
        const notices = loaded.filter((cue) => NOTICE.test(cue.text)).length;
        if (notices) noticed.add(entry.url);
        // Only the notice, no dialogue: the site gives other apps a replacement file.
        const onlyNotice = notices > 0 && notices >= loaded.length * 0.9;
        if (onlyNotice) setReplaced((known) => new Set([...known, entry.url]));
        if (!byViewer && notices) {
          const other = otherTrack(index);
          if (other >= 0) return pickTrack(other, false);
          if (onlyNotice) {
            setTrack(-1);
            if (!replacedNoticed) {
              replacedNoticed = true;
              say(t("player.subtitlesUnavailable"), 4000);
            }
            return;
          }
        }
        setCues(loaded);
      })
      .catch(() => {
        if (track() !== index) return;
        setTrack(-1);
        say(t("player.subtitlesFailed"), 2600);
      });
  };

  /** Ask the API again (links expire, sources go down). */
  const refetch = async (from: number) => {
    setStage("loading");
    setPayload(null);
    setSubtitles([]);
    setTrack(-1);
    setCues([]);
    setCaption("");
    setMessage(t("player.finding"));
    // Asian drama may use subtitles from subtitle services instead (the server's DRAMA_SUBTITLES).
    const alternative =
      props.kind === "drama"
        ? alternativeSubtitles(props.title, props.seasonNumber ?? 1, props.episodeNumber ?? 1)
        : Promise.resolve([]);
    try {
      const fresh =
        props.kind === "anime"
          ? await animeStreams(props.id, props.episodeNumber ?? 1)
          : props.kind === "drama"
            ? await dramaStreams(props.id, props.episodeNumber ?? 1)
            : await streams(props.type, props.id, props.seasonNumber, props.episodeNumber);
      const usable = (fresh.sources ?? []).filter((entry) => entry.url);
      if (!usable.length) {
        fail(t("player.noSource"));
        return;
      }
      tried.clear();
      fetchedAt = from;
      setPayload(fresh);
      play(usable[0], from);
      const own = (fresh.subtitles ?? []).filter((entry) => entry.url);
      // Waited for briefly: the drama's own subtitles are used when nothing comes back in time.
      const found = await Promise.race([
        alternative,
        new Promise<Subtitle[]>((resolve) => setTimeout(() => resolve([]), 8000)),
      ]);
      if (payload() !== fresh) return;
      const list = found.length ? found : own;
      setSubtitles(list);
      const auto = preferredCaption(list);
      if (auto >= 0) pickTrack(auto, false);
      // Subtitles made earlier from these files (by anyone) join the list after the title's own.
      void generatedFor(list.map((entry) => entry.source ?? entry.url)).then((made) => {
        if (!made.length || payload() !== fresh) return;
        setSubtitles([...list, ...made]);
        if (auto < 0 && !loadPrefs().subtitlesOff) {
          const wanted = preferredCaption([...list, ...made]);
          if (wanted >= list.length) pickTrack(wanted, false);
        }
      });
    } catch (error) {
      fail(String((error as Error).message ?? error));
    }
  };

  /* ---- player controls ---- */

  const toggle = () => {
    wake();
    if (stage() !== "ready") return;
    if (video.paused) void video.play().catch(() => setNeedsTap(true));
    else video.pause();
  };

  const seek = (fraction: number) => {
    if (!duration()) return;
    video.currentTime = clamp(fraction) * duration();
    setPosition(video.currentTime);
    remember(video.currentTime, duration());
  };

  const nudge = (seconds: number) => {
    if (stage() !== "ready" || !duration()) return;
    video.currentTime = clamp(video.currentTime + seconds, 0, duration());
    setPosition(video.currentTime);
    setRipple(seconds < 0 ? "back" : "forward");
    clearTimeout(rippleTimer);
    rippleTimer = window.setTimeout(() => setRipple(null), 520);
    wake();
  };

  const toggleMute = () => {
    video.muted = !video.muted;
    say(video.muted ? t("player.muted") : t("player.volume", { percent: Math.round(video.volume * 100) }));
  };

  const setLoudness = (value: number) => {
    video.volume = clamp(value);
    video.muted = video.volume === 0;
    say(t("player.volume", { percent: Math.round(video.volume * 100) }));
  };

  const pickLevel = (index: number) => {
    setLevel(index);
    if (hls) hls.currentLevel = index;
  };

  const pickAudio = (index: number) => {
    setAudio(index);
    if (hls) hls.audioTrack = index;
  };

  const pickSpeed = (rate: number) => {
    setSpeed(rate);
    video.playbackRate = rate;
  };

  const toggleCaptions = () => {
    if (!subtitles().length) return;
    if (track() >= 0) {
      pickTrack(-1);
      say(t("player.subtitlesOff"));
    } else {
      const index = Math.max(0, bestCaption(subtitles()));
      pickTrack(index);
      say(captionName(subtitles()[index]));
    }
  };

  /**
   * Subtitles are drawn by the player over the video. When the video element itself goes
   * fullscreen (iPhone's own player; Chrome on Android when the phone is turned sideways) that
   * layer is left behind, so the same cues also go into the video's own text track, which the
   * browser shows only then.
   */
  const nativeTrack: TextTrack | null = (() => {
    try {
      const track = video.addTextTrack("subtitles", "Catflix");
      track.mode = "hidden";
      return track;
    } catch {
      return null;
    }
  })();
  const [videoFullscreen, setVideoFullscreen] = createSignal(false);
  const checkVideoFullscreen = () => {
    const shell = document as Document & { webkitFullscreenElement?: Element | null };
    const own = video as HTMLVideoElement & { webkitDisplayingFullscreen?: boolean };
    setVideoFullscreen(
      document.fullscreenElement === video ||
        shell.webkitFullscreenElement === video ||
        Boolean(own.webkitDisplayingFullscreen),
    );
  };
  for (const type of [
    "webkitbeginfullscreen",
    "webkitendfullscreen",
    "fullscreenchange",
    "webkitfullscreenchange",
  ]) {
    video.addEventListener(type, () => setTimeout(checkVideoFullscreen, 0));
  }
  document.addEventListener("fullscreenchange", checkVideoFullscreen);
  document.addEventListener("webkitfullscreenchange", checkVideoFullscreen);
  onCleanup(() => {
    document.removeEventListener("fullscreenchange", checkVideoFullscreen);
    document.removeEventListener("webkitfullscreenchange", checkVideoFullscreen);
  });
  createEffect(() => {
    if (!nativeTrack) return;
    const list = cues();
    const offset = shift();
    for (const old of Array.from(nativeTrack.cues ?? [])) nativeTrack.removeCue(old);
    if (typeof VTTCue === "undefined") return;
    for (const cue of list) {
      const start = cue.start + offset;
      if (cue.end + offset <= 0) continue;
      nativeTrack.addCue(new VTTCue(Math.max(0, start), cue.end + offset, cue.text));
    }
  });
  createEffect(() => {
    if (nativeTrack) nativeTrack.mode = videoFullscreen() && cues().length ? "showing" : "hidden";
  });

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (root.requestFullscreen) {
      root
        .requestFullscreen()
        .then(() => (screen.orientation as any)?.lock?.("landscape"))
        .catch(() => undefined);
    } else {
      // iPhone only offers its own fullscreen video player.
      (video as any).webkitEnterFullscreen?.();
    }
  };

  const togglePip = () => {
    if (document.pictureInPictureElement) void document.exitPictureInPicture();
    else void video.requestPictureInPicture().catch(() => say(t("player.pipUnavailable"), 2600));
  };

  const goNext = () => {
    stopCountdown();
    if (props.nextHref) window.location.hash = `#${props.nextHref}`;
  };

  const leave = () => history.back();

  /* ---- settings panel ---- */

  const panels = createMemo(() => {
    const list: { id: Panel; label: string }[] = [];
    if (levels().length > 1) list.push({ id: "quality", label: t("player.quality") });
    if (subtitles().length) list.push({ id: "subtitles", label: t("player.subtitles") });
    if (audioTracks().length > 1) list.push({ id: "audio", label: t("player.audio") });
    list.push({ id: "speed", label: t("player.speed") });
    if ((payload()?.sources ?? []).length > 1) list.push({ id: "source", label: t("player.source") });
    return list;
  });

  const options = createMemo((): Option[] => {
    switch (panel()) {
      case "quality":
        return [
          {
            label: t("player.auto"),
            hint:
              level() === -1 && autoHeight()
                ? t("player.autoNow", { height: autoHeight() })
                : t("player.autoHint"),
            active: level() === -1,
            pick: () => pickLevel(-1),
          },
          ...levels().map((entry) => ({
            label: `${entry.height}p`,
            active: level() === entry.index,
            pick: () => pickLevel(entry.index),
          })),
        ];
      case "subtitles":
        return [
          { label: t("player.off"), active: track() === -1, pick: () => pickTrack(-1) },
          ...subtitles().map((entry, index) => ({
            label: captionName(entry),
            hint:
              entry.generated?.status === "working"
                ? t("maker.inProgress", { percent: percentOf(entry) })
                : replaced().has(entry.url)
                  ? t("player.subtitleNotice")
                  : undefined,
            active: track() === index,
            pick: () => pickTrack(index),
          })),
          ...(track() >= 0
            ? [
                {
                  label: t("player.subtitlesEarlier"),
                  hint: shift()
                    ? t("player.subtitleShift", { seconds: shift() > 0 ? `+${shift()}` : String(shift()) })
                    : undefined,
                  active: false,
                  pick: () => moveSubtitles(-0.5),
                },
                { label: t("player.subtitlesLater"), active: false, pick: () => moveSubtitles(0.5) },
              ]
            : []),
          ...(sources().length
            ? [{ label: t("maker.create"), active: false, action: true, pick: () => setMaker(true) }]
            : []),
        ];
      case "audio":
        return audioTracks().map((entry) => ({
          label: entry.label,
          active: audio() === entry.index,
          pick: () => pickAudio(entry.index),
        }));
      case "speed":
        return SPEEDS.map((rate) => ({
          label: rate === 1 ? t("player.normal") : `${rate}×`,
          active: speed() === rate,
          pick: () => pickSpeed(rate),
        }));
      case "source":
        return (payload()?.sources ?? []).map((entry, index) => ({
          label: entry.server ?? t("player.sourceNumber", { number: index + 1 }),
          hint: [entry.quality, entry.audio].filter(Boolean).join(" · ") || undefined,
          active: source()?.url === entry.url,
          pick: () => play(entry, video.currentTime),
        }));
      default:
        return [];
    }
  });

  const focusPanel = () => {
    queueMicrotask(() => {
      const target =
        sheet?.querySelector<HTMLElement>(".option[data-active]") ??
        sheet?.querySelector<HTMLElement>(".option");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest" });
    });
  };

  const openPanel = (wanted?: Panel) => {
    const available = panels();
    const target = available.find((entry) => entry.id === wanted) ?? available[0];
    if (!target) return;
    setPanel(target.id);
    wake();
    focusPanel();
  };

  const closePanel = () => {
    setPanel(null);
    setMaker(false);
    wake();
  };

  /* ---- timeline ---- */

  const fractionAt = (event: PointerEvent, bar: HTMLElement) => {
    const box = bar.getBoundingClientRect();
    return clamp((event.clientX - box.left) / box.width);
  };

  const played = () => {
    const dragging = scrub();
    if (dragging !== null) return dragging;
    return duration() ? clamp(position() / duration()) : 0;
  };

  const pointed = () => scrub() ?? hover();

  /* ---- gestures on the picture ---- */

  const onStageClick = (event: MouseEvent) => {
    if (panel()) return closePanel();
    if (pointerKind === "mouse") return toggle();

    // Touch: a tap shows or hides the controls, a double tap on a side skips.
    const now = performance.now();
    if (now - lastTap < 300) {
      lastTap = 0;
      const box = root.getBoundingClientRect();
      const where = (event.clientX - box.left) / box.width;
      if (where < 0.38) nudge(-SKIP);
      else if (where > 0.62) nudge(SKIP);
      else toggle();
      return;
    }
    lastTap = now;
    if (active() && mayHide()) setActive(false);
    else wake();
  };

  /* ---- keys ---- */

  const focusedControl = () => {
    const node = document.activeElement as HTMLElement | null;
    return node && node !== document.body && node !== root && root.contains(node) ? node : null;
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    const target = event.target as HTMLElement | null;
    const typing = target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
    const direction = directionOf(key);

    if (key === "Escape" || isBackKey(event)) {
      event.preventDefault();
      if (panel()) closePanel();
      else if (usesDpad && focusedControl() && mayHide()) hide();
      else if (document.fullscreenElement) void document.exitFullscreen();
      else leave();
      return;
    }

    // The settings panel takes the arrows while it is open.
    if (panel()) {
      if (direction && sheet) {
        event.preventDefault();
        moveFocus(direction, sheet);
      }
      return;
    }

    // The volume slider handles its own arrows.
    if (typing) return;

    const control = focusedControl();
    const onTimeline = control?.classList.contains("timeline");

    if (usesDpad && stage() !== "ready") {
      // Loading, error and end screens: the arrows move between their buttons.
      if (direction) {
        event.preventDefault();
        moveFocus(direction, root);
      }
      return;
    }

    if (usesDpad) {
      if (!control) {
        // Up or down brings the controls up and puts the remote on them.
        if (direction === "up" || direction === "down") {
          event.preventDefault();
          wake();
          playButton?.focus({ preventScroll: true });
          return;
        }
        if (key === "Enter") {
          event.preventDefault();
          toggle();
          return;
        }
      } else if (direction && !(onTimeline && (direction === "left" || direction === "right"))) {
        event.preventDefault();
        wake();
        moveFocus(direction, root);
        return;
      } else if (key === "Enter" || key === " ") {
        // The focused control takes the press.
        wake();
        if (!onTimeline) return;
      }
    }

    const actions: Record<string, () => void> = {
      " ": toggle,
      k: toggle,
      MediaPlayPause: toggle,
      ArrowRight: () => nudge(SKIP),
      ArrowLeft: () => nudge(-SKIP),
      l: () => nudge(SKIP),
      j: () => nudge(-SKIP),
      MediaFastForward: () => nudge(SKIP * 3),
      MediaRewind: () => nudge(-SKIP * 3),
      ArrowUp: () => setLoudness(video.volume + 0.05),
      ArrowDown: () => setLoudness(video.volume - 0.05),
      f: toggleFullscreen,
      m: toggleMute,
      c: toggleCaptions,
      n: goNext,
      MediaTrackNext: goNext,
    };
    const action = actions[key];
    if (action) {
      event.preventDefault();
      action();
      wake();
    }
  };

  /** Load a stream for the current episode. */
  const load = () => {
    stopCountdown();
    fallbackNoticed = false;
    setPosition(0);
    setDuration(0);
    setBuffered(0);
    void refetch(resumeFrom());
  };

  // A new episode reuses this component, so reload when the key moves.
  createEffect(on(key, () => load()));

  // With a remote, land on the main action of whatever screen comes up.
  createEffect(
    on(stage, (now) => {
      if (!usesDpad || (now !== "error" && now !== "ended")) return;
      queueMicrotask(() => root.querySelector<HTMLElement>(".overlay .btn")?.focus({ preventScroll: true }));
    }),
  );

  // Lock-screen and remote transport controls.
  createEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: props.title,
        artist: props.subtitle ?? "Catflix",
        artwork: props.poster ? [{ src: props.poster }] : [],
      });
      navigator.mediaSession.setActionHandler("seekbackward", () => nudge(-SKIP));
      navigator.mediaSession.setActionHandler("seekforward", () => nudge(SKIP));
      navigator.mediaSession.setActionHandler("nexttrack", props.nextHref ? goNext : null);
    } catch {
      /* not supported here */
    }
  });

  onMount(() => {
    const prefs = loadPrefs();
    video.volume = prefs.volume ?? 1;
    video.muted = prefs.muted ?? false;
    setVolume(video.volume);
    setMuted(video.muted);

    const sync = () => {
      setPosition(video.currentTime);
      if (Number.isFinite(video.duration)) setDuration(video.duration);
    };
    const onPlay = () => {
      setPlaying(true);
      setNeedsTap(false);
      wake();
      if (pendingNotice) {
        say(pendingNotice, 5000);
        pendingNotice = "";
      }
    };
    const onPause = () => {
      setPlaying(false);
      wake();
    };
    const onVolume = () => {
      setVolume(video.volume);
      setMuted(video.muted);
      // A mute the player applied itself to start is not the viewer's preference.
      if (autoMuted) {
        if (video.muted) return;
        autoMuted = false;
      }
      savePrefs({ volume: video.volume, muted: video.muted });
    };
    const onEnded = () => {
      setStage("ended");
      remember(video.duration || 0, video.duration || 0);
      if (props.next && props.nextHref) {
        setCountdown(NEXT_AFTER);
        countdownTimer = window.setInterval(() => {
          const left = (countdown() ?? 1) - 1;
          if (left <= 0) goNext();
          else setCountdown(left);
        }, 1000);
      }
    };
    const onWaiting = () => setWaiting(true);
    const onFlowing = () => setWaiting(false);
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));

    video.addEventListener("timeupdate", sync);
    video.addEventListener("durationchange", sync);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolume);
    video.addEventListener("ended", onEnded);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onFlowing);
    video.addEventListener("canplay", onFlowing);
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("fullscreenchange", onFullscreen));
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

    captionTicker = window.setInterval(() => {
      const list = cues();
      setCaption(list.length ? cueAt(list, video.currentTime - shift()) : "");
    }, 120);

    // Sources expire after a while; refresh ahead of the stall.
    pollTimer = window.setInterval(() => {
      if (stage() === "ready" && video.currentTime > 0) void refetch(video.currentTime);
    }, 45 * 60_000);
  });

  onCleanup(() => {
    clearInterval(heartbeat);
    clearInterval(ticker);
    clearInterval(pollTimer);
    clearInterval(captionTicker);
    clearInterval(countdownTimer);
    clearTimeout(idleTimer);
    clearTimeout(toastTimer);
    clearTimeout(rippleTimer);
    window.removeEventListener("keydown", onKey);
    if (Number.isFinite(video.duration) && video.currentTime > 2) {
      remember(video.currentTime, video.duration);
    }
    destroyStream();
  });

  const art = () => props.backdrop ?? props.poster;

  return (
    <div
      class="player"
      ref={root}
      data-active={active()}
      data-stage={stage()}
      data-paused={!playing() || undefined}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") wake();
      }}
    >
      {video}

      <Show when={art()}>
        <div class="player-art" style={{ "background-image": `url("${art()}")` }} />
      </Show>

      <div
        class="stage"
        onPointerDown={(event) => (pointerKind = event.pointerType)}
        onClick={onStageClick}
        onDblClick={() => {
          if (pointerKind === "mouse") toggleFullscreen();
        }}
      />

      <Show when={caption() && stage() === "ready"}>
        <div class="captions">
          <span>{caption()}</span>
        </div>
      </Show>

      <Show when={ripple()}>
        {(side) => (
          <div class="ripple" data-side={side()}>
            {side() === "back" ? "−" : "+"}
            {SKIP}s
          </div>
        )}
      </Show>

      <Show when={toast()}>
        <div class="hud" role="status">
          {toast()}
        </div>
      </Show>

      <Show when={stage() === "ready" && waiting() && !needsTap()}>
        <div class="buffering">
          <div class="spinner" />
        </div>
      </Show>

      <div class="player-bar" onPointerDown={wake}>
        <button class="icon-btn" aria-label={t("player.back")} onClick={leave}>
          <Back />
        </button>
        <div class="player-title">
          <h2>{props.title}</h2>
          <Show when={props.subtitle}>
            <p>{props.subtitle}</p>
          </Show>
        </div>
      </div>

      {/* Thumb-reach transport for touch screens. */}
      <Show when={isTouch && stage() === "ready" && !needsTap()}>
        <div class="transport">
          <button class="icon-btn" aria-label={t("player.back10")} onClick={() => nudge(-SKIP)}>
            <SkipBack />
          </button>
          <button
            class="icon-btn transport-main"
            aria-label={t(playing() ? "player.pause" : "player.play")}
            onClick={toggle}
          >
            <Show when={playing()} fallback={<Play />}>
              <Pause />
            </Show>
          </button>
          <button class="icon-btn" aria-label={t("player.forward10")} onClick={() => nudge(SKIP)}>
            <SkipForward />
          </button>
        </div>
      </Show>

      <Show when={stage() === "loading"}>
        <div class="overlay overlay-loading">
          <p class="eyebrow">
            {resumeFrom() > 0 ? t("player.resuming", { time: clock(resumeFrom()) }) : t("player.starting")}
          </p>
          <h3 class="overlay-title">{props.title}</h3>
          <Show when={props.subtitle}>
            <p>{props.subtitle}</p>
          </Show>
          <div class="loadbar" />
          <p class="overlay-status">{message() || t("player.preparing")}</p>
        </div>
      </Show>

      <Show when={stage() === "error"}>
        <div class="overlay">
          <h3>{t("player.errorTitle")}</h3>
          <p>{message()}</p>
          <div class="row-actions">
            <button class="btn btn-primary" onClick={() => void refetch(resumeFrom())}>
              {t("player.tryAnother")}
            </button>
            <button class="btn btn-ghost" onClick={leave}>
              {t("common.back")}
            </button>
          </div>
        </div>
      </Show>

      <Show when={needsTap() && stage() === "ready" && !playing()}>
        <div class="overlay overlay-clear" onClick={toggle}>
          <button class="icon-btn big-play" aria-label={t("player.play")}>
            <Play />
          </button>
          <p>{t("player.ready")}</p>
        </div>
      </Show>

      <Show when={stage() === "ended"}>
        <div class="overlay">
          <Show
            when={props.next}
            fallback={
              <>
                <p class="eyebrow">{t("player.finished")}</p>
                <h3 class="overlay-title">{props.title}</h3>
              </>
            }
          >
            <p class="eyebrow">
              {countdown() !== null ? t("player.upNextIn", { seconds: countdown()! }) : t("player.upNext")}
            </p>
            <h3 class="overlay-title">{props.next!.label}</h3>
            <p>{props.title}</p>
          </Show>
          <div class="row-actions">
            <Show when={props.next}>
              <button class="btn btn-primary" onClick={goNext}>
                <Next /> {t("player.playNext")}
              </button>
            </Show>
            <button
              class="btn btn-ghost"
              onClick={() => {
                stopCountdown();
                forget();
                video.currentTime = 0;
                void video.play();
                setStage("ready");
              }}
            >
              {t("player.again")}
            </button>
            <Show when={countdown() !== null}>
              <button class="btn btn-ghost" onClick={stopCountdown}>
                {t("player.cancel")}
              </button>
            </Show>
          </div>
        </div>
      </Show>

      <div class="player-foot" onPointerDown={wake}>
        <div
          class="timeline"
          role="slider"
          tabindex="0"
          aria-label={t("player.seek")}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration())}
          aria-valuenow={Math.round(position())}
          aria-valuetext={t("player.seekValue", { position: clock(position()), duration: clock(duration()) })}
          data-scrubbing={scrub() !== null || undefined}
          onPointerDown={(event) => {
            if (!duration()) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setScrub(fractionAt(event, event.currentTarget));
          }}
          onPointerMove={(event) => {
            const at = fractionAt(event, event.currentTarget);
            if (scrub() !== null) setScrub(at);
            else if (event.pointerType === "mouse") setHover(at);
          }}
          onPointerUp={() => {
            const at = scrub();
            if (at === null) return;
            seek(at);
            setScrub(null);
            wake();
          }}
          onPointerCancel={() => setScrub(null)}
          onPointerLeave={() => setHover(null)}
        >
          <div class="track">
            <div
              class="buffered"
              style={{ width: `${duration() ? clamp(buffered() / duration()) * 100 : 0}%` }}
            />
            <div class="fill" style={{ width: `${played() * 100}%` }} />
          </div>
          <div class="thumb" style={{ left: `${played() * 100}%` }} />
          <Show when={pointed() !== null && duration()}>
            <div class="tip" style={{ left: `${pointed()! * 100}%` }}>
              {clock(pointed()! * duration())}
            </div>
          </Show>
        </div>

        <div class="controls">
          <button
            class="icon-btn desk"
            ref={playButton}
            aria-label={t(playing() ? "player.pause" : "player.play")}
            onClick={toggle}
          >
            <Show when={playing()} fallback={<Play />}>
              <Pause />
            </Show>
          </button>
          <button class="icon-btn desk" aria-label={t("player.back10")} onClick={() => nudge(-SKIP)}>
            <SkipBack />
          </button>
          <button class="icon-btn desk" aria-label={t("player.forward10")} onClick={() => nudge(SKIP)}>
            <SkipForward />
          </button>
          <div class="volume desk">
            <button
              class="icon-btn"
              aria-label={t(muted() ? "player.unmute" : "player.mute")}
              onClick={toggleMute}
            >
              <Show when={muted() || volume() === 0} fallback={<Volume />}>
                <Muted />
              </Show>
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              aria-label={t("player.volumeLabel")}
              value={muted() ? 0 : volume()}
              style={{ "--value": `${(muted() ? 0 : volume()) * 100}%` }}
              onInput={(event) => {
                video.volume = Number(event.currentTarget.value);
                video.muted = video.volume === 0;
              }}
            />
          </div>
          <span class="time">
            {clock(scrub() !== null ? scrub()! * duration() : position())}
            <i> / {clock(duration())}</i>
          </span>
          <span class="grow" />

          <Show when={props.next}>
            <button class="pill-btn" onClick={goNext}>
              <Next /> <span>{t("player.nextEpisode")}</span>
            </button>
          </Show>
          <Show when={subtitles().length}>
            <button
              class="icon-btn"
              aria-label={t("player.subtitles")}
              data-on={track() >= 0 || undefined}
              onClick={() => (panel() === "subtitles" ? closePanel() : openPanel("subtitles"))}
            >
              <Captions />
            </button>
          </Show>
          <button
            class="icon-btn"
            aria-label={t("player.settings")}
            data-control="settings"
            aria-expanded={panel() !== null}
            onClick={() => (panel() ? closePanel() : openPanel())}
          >
            <Sliders />
          </button>
          <Show when={canPip}>
            <button class="icon-btn desk pip-btn" aria-label={t("player.pip")} onClick={togglePip}>
              <Pip />
            </button>
          </Show>
          <button
            class="icon-btn"
            aria-label={t(fullscreen() ? "player.leaveFullscreen" : "player.fullscreen")}
            onClick={toggleFullscreen}
          >
            <Show when={fullscreen()} fallback={<Expand />}>
              <Compress />
            </Show>
          </button>
        </div>
      </div>

      <Show when={panel()}>
        <div class="sheet" ref={sheet} role="dialog" aria-label={t("player.settings")}>
          <div class="sheet-head">
            <div class="sheet-tabs" role="tablist">
              <For each={panels()}>
                {(entry) => (
                  <button
                    role="tab"
                    aria-selected={panel() === entry.id}
                    data-active={panel() === entry.id || undefined}
                    onClick={() => setPanel(entry.id)}
                  >
                    {entry.label}
                  </button>
                )}
              </For>
            </div>
            <button class="icon-btn" aria-label={t("player.closeSettings")} onClick={closePanel}>
              <Close />
            </button>
          </div>
          <Show
            when={maker() && panel() === "subtitles"}
            fallback={
              <div class="sheet-list">
                <For each={options()}>
                  {(entry) => (
                    <button
                      class={entry.action ? "option option-action" : "option"}
                      data-active={entry.active || undefined}
                      onClick={() => {
                        entry.pick();
                        wake();
                      }}
                    >
                      <Show when={entry.action}>
                        <SparkleIcon />
                      </Show>
                      <span>
                        {entry.label}
                        <Show when={entry.hint}>
                          <small>{entry.hint}</small>
                        </Show>
                      </span>
                      <Show when={entry.active}>
                        <Check />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            }
          >
            <SubtitleMaker
              sources={sources()}
              all={subtitles()}
              sourceName={captionName}
              onCreated={addGenerated}
              onBack={() => {
                setMaker(false);
                focusPanel();
              }}
            />
          </Show>
        </div>
      </Show>
    </div>
  );
}
