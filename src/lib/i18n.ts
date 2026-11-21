/** Interface language: English or Indonesian, chosen on first run and remembered. */

import { createSignal } from "solid-js";
import { loadPrefs, savePrefs } from "./store";

export type Language = "en" | "id";

export const LANGUAGES: { id: Language; name: string; note: string }[] = [
  { id: "en", name: "English", note: "Interface and subtitles in English" },
  {
    id: "id",
    name: "Bahasa Indonesia",
    note: "Antarmuka, deskripsi, dan subtitle dalam bahasa Indonesia",
  },
];

const en = {
  "nav.home": "Home",
  "nav.films": "Films",
  "nav.series": "Series",
  "nav.search": "Search",
  "nav.sections": "Sections",
  "nav.language": "Language",

  "common.film": "Film",
  "common.series": "Series",
  "common.loading": "Loading…",
  "common.retry": "Try again",
  "common.back": "Go back",
  "common.scrollBack": "Scroll back",
  "common.scrollForward": "Scroll forward",

  "search.placeholder": "Search films and series",
  "search.pagePlaceholder": "Search films, series and anime",
  "search.label": "Search Catflix",
  "search.clear": "Clear search",
  "search.emptyHint": "Type a film or series title to find it.",
  "search.noneTitle": "No matches for “{term}”",
  "search.noneHint": "Check the spelling or try a shorter title.",
  "search.countOne": "1 title for “{term}”",
  "search.count": "{count} titles for “{term}”",
  "search.error": "Catflix could not run this search",

  "home.featuredFilm": "Featured film",
  "home.featuredSeries": "Featured series",
  "home.play": "Play",
  "home.episodes": "Episodes",
  "home.moreInfo": "More info",
  "home.continue": "Continue watching",
  "home.error": "Catflix could not reach its catalogue",
  "home.emptyTitle": "The catalogue came back empty",
  "home.emptyHint": "Catflix may be switching servers. Try again in a moment.",
  "home.footer":
    "Catflix — a small, ad-free streaming app. Metadata courtesy of TMDB; films belong to their rights holders.",

  "rail.trending_movies": "Trending films",
  "rail.popular_movies": "Popular films",
  "rail.popular_tv": "Popular series",
  "rail.popular_anime": "Popular anime",
  "rail.new_releases": "New releases",
  "rail.action_movies": "Action",
  "rail.scifi_movies": "Science fiction",
  "rail.thriller_movies": "Thriller",
  "rail.comedy_movies": "Comedy",
  "rail.airing_anime": "Airing now",

  "browse.popular": "Popular",
  "browse.topRated": "Top rated",
  "browse.newest": "Newest",
  "browse.sortBy": "Sort by",
  "browse.genre": "Genre",
  "browse.allGenres": "All genres",
  "browse.error": "Catflix could not load this list",
  "browse.emptyTitle": "Nothing in this genre yet",
  "browse.emptyHint": "Pick another genre to keep browsing.",
  "browse.previous": "Previous",
  "browse.next": "Next",
  "browse.page": "Page {page} of {pages}",

  "detail.error": "Catflix could not load this title",
  "detail.backHome": "Back to home",
  "detail.seasonsOne": "1 season",
  "detail.seasons": "{count} seasons",
  "detail.play": "Play",
  "detail.resume": "Resume",
  "detail.playCode": "Play {code}",
  "detail.resumeCode": "Resume {code}",
  "detail.trailer": "Watch trailer",
  "detail.episodes": "Episodes",
  "detail.season": "Season {number}",
  "detail.episode": "Episode {number}",
  "detail.watched": "{percent}% watched",
  "detail.episodesError": "Catflix could not load these episodes.",
  "detail.loadingEpisodes": "Loading episodes…",
  "detail.noEpisodes": "No episodes in this season yet",
  "detail.cast": "Cast",
  "detail.more": "More like this",
  "detail.footer": "Plays in Catflix, without ads.",

  "watch.openingFilm": "Opening the film…",
  "watch.openingEpisode": "Opening the episode…",
  "watch.filmError": "Catflix could not open this film",
  "watch.episodeError": "Catflix could not open this episode",

  "player.starting": "Starting",
  "player.resuming": "Resuming at {time}",
  "player.finding": "Finding a working source…",
  "player.preparing": "Preparing…",
  "player.errorTitle": "This title did not start",
  "player.noSource": "No working source for this title right now. Try again in a moment.",
  "player.sourceStopped": "This source stopped working.",
  "player.tryAnother": "Try another source",
  "player.ready": "Ready when you are. Press play to start.",
  "player.finished": "Finished",
  "player.upNext": "Up next",
  "player.upNextIn": "Up next in {seconds}",
  "player.playNext": "Play next episode",
  "player.again": "Watch again",
  "player.cancel": "Cancel",
  "player.nextEpisode": "Next episode",
  "player.quality": "Quality",
  "player.subtitles": "Subtitles",
  "player.audio": "Audio",
  "player.speed": "Speed",
  "player.source": "Source",
  "player.auto": "Auto",
  "player.autoNow": "{height}p now",
  "player.autoHint": "Follows your connection",
  "player.off": "Off",
  "player.normal": "Normal",
  "player.sourceNumber": "Source {number}",
  "player.trackNumber": "Track {number}",
  "player.muted": "Muted",
  "player.volume": "Volume {percent}%",
  "player.subtitlesOff": "Subtitles off",
  "player.subtitlesFailed": "Those subtitles could not be loaded",
  "player.noIndonesian": "No Indonesian subtitles for this title. Showing English.",
  "player.pipUnavailable": "Picture in picture is not available",
  "player.back": "Back",
  "player.play": "Play",
  "player.pause": "Pause",
  "player.back10": "Back 10 seconds",
  "player.forward10": "Forward 10 seconds",
  "player.mute": "Mute",
  "player.unmute": "Unmute",
  "player.volumeLabel": "Volume",
  "player.seek": "Seek",
  "player.seekValue": "{position} of {duration}",
  "player.settings": "Playback settings",
  "player.closeSettings": "Close settings",
  "player.pip": "Picture in picture",
  "player.fullscreen": "Fullscreen",
  "player.leaveFullscreen": "Leave fullscreen",
};

export type Phrase = keyof typeof en;

const id: Record<Phrase, string> = {
  "nav.home": "Beranda",
  "nav.films": "Film",
  "nav.series": "Serial",
  "nav.search": "Cari",
  "nav.sections": "Bagian",
  "nav.language": "Bahasa",

  "common.film": "Film",
  "common.series": "Serial",
  "common.loading": "Memuat…",
  "common.retry": "Coba lagi",
  "common.back": "Kembali",
  "common.scrollBack": "Gulir ke belakang",
  "common.scrollForward": "Gulir ke depan",

  "search.placeholder": "Cari film dan serial",
  "search.pagePlaceholder": "Cari film, serial, dan anime",
  "search.label": "Cari di Catflix",
  "search.clear": "Hapus pencarian",
  "search.emptyHint": "Ketik judul film atau serial untuk menemukannya.",
  "search.noneTitle": "Tidak ada hasil untuk “{term}”",
  "search.noneHint": "Periksa ejaannya atau coba judul yang lebih pendek.",
  "search.countOne": "1 judul untuk “{term}”",
  "search.count": "{count} judul untuk “{term}”",
  "search.error": "Catflix tidak dapat menjalankan pencarian ini",

  "home.featuredFilm": "Film unggulan",
  "home.featuredSeries": "Serial unggulan",
  "home.play": "Putar",
  "home.episodes": "Episode",
  "home.moreInfo": "Selengkapnya",
  "home.continue": "Lanjutkan menonton",
  "home.error": "Catflix tidak dapat menjangkau katalognya",
  "home.emptyTitle": "Katalog sedang kosong",
  "home.emptyHint": "Catflix mungkin sedang berpindah server. Coba lagi sebentar lagi.",
  "home.footer":
    "Catflix — aplikasi streaming kecil tanpa iklan. Metadata dari TMDB; film adalah milik pemegang haknya masing-masing.",

  "rail.trending_movies": "Film yang sedang tren",
  "rail.popular_movies": "Film populer",
  "rail.popular_tv": "Serial populer",
  "rail.popular_anime": "Anime populer",
  "rail.new_releases": "Rilis terbaru",
  "rail.action_movies": "Aksi",
  "rail.scifi_movies": "Fiksi ilmiah",
  "rail.thriller_movies": "Thriller",
  "rail.comedy_movies": "Komedi",
  "rail.airing_anime": "Sedang tayang",

  "browse.popular": "Populer",
  "browse.topRated": "Rating tertinggi",
  "browse.newest": "Terbaru",
  "browse.sortBy": "Urutkan",
  "browse.genre": "Genre",
  "browse.allGenres": "Semua genre",
  "browse.error": "Catflix tidak dapat memuat daftar ini",
  "browse.emptyTitle": "Belum ada apa-apa di genre ini",
  "browse.emptyHint": "Pilih genre lain untuk terus menjelajah.",
  "browse.previous": "Sebelumnya",
  "browse.next": "Berikutnya",
  "browse.page": "Halaman {page} dari {pages}",

  "detail.error": "Catflix tidak dapat memuat judul ini",
  "detail.backHome": "Kembali ke beranda",
  "detail.seasonsOne": "1 musim",
  "detail.seasons": "{count} musim",
  "detail.play": "Putar",
  "detail.resume": "Lanjutkan",
  "detail.playCode": "Putar {code}",
  "detail.resumeCode": "Lanjutkan {code}",
  "detail.trailer": "Tonton trailer",
  "detail.episodes": "Episode",
  "detail.season": "Musim {number}",
  "detail.episode": "Episode {number}",
  "detail.watched": "{percent}% ditonton",
  "detail.episodesError": "Catflix tidak dapat memuat episode ini.",
  "detail.loadingEpisodes": "Memuat episode…",
  "detail.noEpisodes": "Belum ada episode di musim ini",
  "detail.cast": "Pemeran",
  "detail.more": "Serupa dengan ini",
  "detail.footer": "Diputar di Catflix, tanpa iklan.",

  "watch.openingFilm": "Membuka film…",
  "watch.openingEpisode": "Membuka episode…",
  "watch.filmError": "Catflix tidak dapat membuka film ini",
  "watch.episodeError": "Catflix tidak dapat membuka episode ini",

  "player.starting": "Memulai",
  "player.resuming": "Melanjutkan dari {time}",
  "player.finding": "Mencari sumber yang berfungsi…",
  "player.preparing": "Menyiapkan…",
  "player.errorTitle": "Judul ini tidak dapat diputar",
  "player.noSource": "Belum ada sumber yang berfungsi untuk judul ini. Coba lagi sebentar lagi.",
  "player.sourceStopped": "Sumber ini berhenti berfungsi.",
  "player.tryAnother": "Coba sumber lain",
  "player.ready": "Siap kapan pun Anda mau. Tekan putar untuk memulai.",
  "player.finished": "Selesai",
  "player.upNext": "Berikutnya",
  "player.upNextIn": "Berikutnya dalam {seconds}",
  "player.playNext": "Putar episode berikutnya",
  "player.again": "Tonton lagi",
  "player.cancel": "Batal",
  "player.nextEpisode": "Episode berikutnya",
  "player.quality": "Kualitas",
  "player.subtitles": "Subtitle",
  "player.audio": "Audio",
  "player.speed": "Kecepatan",
  "player.source": "Sumber",
  "player.auto": "Otomatis",
  "player.autoNow": "{height}p saat ini",
  "player.autoHint": "Mengikuti koneksi Anda",
  "player.off": "Nonaktif",
  "player.normal": "Normal",
  "player.sourceNumber": "Sumber {number}",
  "player.trackNumber": "Trek {number}",
  "player.muted": "Suara dimatikan",
  "player.volume": "Volume {percent}%",
  "player.subtitlesOff": "Subtitle nonaktif",
  "player.subtitlesFailed": "Subtitle itu tidak dapat dimuat",
  "player.noIndonesian": "Subtitle Indonesia belum tersedia untuk judul ini. Menampilkan bahasa Inggris.",
  "player.pipUnavailable": "Gambar dalam gambar tidak tersedia",
  "player.back": "Kembali",
  "player.play": "Putar",
  "player.pause": "Jeda",
  "player.back10": "Mundur 10 detik",
  "player.forward10": "Maju 10 detik",
  "player.mute": "Matikan suara",
  "player.unmute": "Nyalakan suara",
  "player.volumeLabel": "Volume",
  "player.seek": "Geser waktu",
  "player.seekValue": "{position} dari {duration}",
  "player.settings": "Pengaturan pemutaran",
  "player.closeSettings": "Tutup pengaturan",
  "player.pip": "Gambar dalam gambar",
  "player.fullscreen": "Layar penuh",
  "player.leaveFullscreen": "Keluar dari layar penuh",
};

const PHRASES: Record<Language, Record<Phrase, string>> = { en, id };

/** Genre names as the catalogue sends them, in Indonesian. */
const GENRES_ID: Record<string, string> = {
  Action: "Aksi",
  Adventure: "Petualangan",
  Animation: "Animasi",
  Comedy: "Komedi",
  Crime: "Kriminal",
  Documentary: "Dokumenter",
  Drama: "Drama",
  Family: "Keluarga",
  Fantasy: "Fantasi",
  History: "Sejarah",
  Horror: "Horor",
  Music: "Musik",
  Mystery: "Misteri",
  Romance: "Romansa",
  "Science Fiction": "Fiksi Ilmiah",
  "TV Movie": "Film TV",
  Thriller: "Thriller",
  War: "Perang",
  Western: "Western",
  "Action & Adventure": "Aksi & Petualangan",
  Kids: "Anak-anak",
  News: "Berita",
  Reality: "Realitas",
  "Sci-Fi & Fantasy": "Fiksi Ilmiah & Fantasi",
  Soap: "Opera Sabun",
  Talk: "Bincang-bincang",
  "War & Politics": "Perang & Politik",
};

const stored = loadPrefs().language;
const [current, setCurrent] = createSignal<Language>(stored ?? "en");
const [chosen, setChosen] = createSignal(stored !== undefined);

/** The viewer's language. Reactive. */
export const language = current;

/** False until the first-run question has been answered. */
export const languageChosen = chosen;

export function setLanguage(next: Language) {
  setCurrent(next);
  setChosen(true);
  savePrefs({ language: next });
  document.documentElement.lang = next;
}

document.documentElement.lang = current();

/** A phrase in the viewer's language, with `{name}` placeholders filled in. */
export function t(phrase: Phrase, values?: Record<string, string | number>) {
  const text = PHRASES[current()][phrase] ?? en[phrase];
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

/** A phrase that may not exist (a row the catalogue added), with a fallback. */
export function phraseOr(key: string, fallback: string) {
  return key in en ? t(key as Phrase) : fallback;
}

export function genreName(name: string) {
  return current() === "id" ? (GENRES_ID[name] ?? name) : name;
}

/** "Season 3" from the catalogue, in the viewer's language. Other names pass through. */
export function seasonName(name: string | undefined, number: number) {
  if (!name || /^Season \d+$/.test(name)) return t("detail.season", { number });
  return name;
}

/** Subtitle language codes and names that count as a match for each interface language. */
const SUBTITLE_MATCH: Record<Language, RegExp> = {
  en: /^(en|eng)\b|english/i,
  id: /^(id|in|ind)\b|indonesia/i,
};

export function matchesLanguage(
  entry: { lang?: string; language?: string; label?: string },
  wanted: Language,
) {
  const test = SUBTITLE_MATCH[wanted];
  return [entry.lang, entry.language, entry.label].some((value) => value && test.test(value));
}
