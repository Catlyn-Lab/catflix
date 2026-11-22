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
  "nav.anime": "Anime",
  "nav.drama": "Asian drama",
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
  "search.anime": "Anime",
  "search.drama": "Asian drama",

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

  "home.animeRail": "Anime to try",
  "home.dramaRail": "Asian dramas",

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
  "browse.ongoing": "Ongoing",
  "browse.completed": "Completed",

  "anime.popular": "Popular",
  "anime.ongoing": "Ongoing",
  "anime.newest": "Newest",
  "anime.az": "A–Z",
  "anime.error": "Catflix could not load the anime list",
  "anime.emptyTitle": "Nothing here yet",
  "anime.emptyHint": "Pick another genre or ordering to keep browsing.",
  "anime.episodes": "Episodes",
  "anime.noEpisodes": "This anime has no episodes listed yet",

  "drama.kind": "Kind",
  "drama.allKinds": "All",
  "drama.films": "Films",
  "drama.series": "Series",
  "drama.region": "Region",
  "drama.allRegions": "All regions",
  "drama.state": "Status",
  "drama.anyState": "Any",
  "drama.error": "Catflix could not load the drama list",
  "drama.emptyTitle": "Nothing in this region yet",
  "drama.emptyHint": "Pick another region or status to keep browsing.",

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
  "detail.anime": "Anime",
  "detail.drama": "Asian drama",
  "detail.episodeName": "Episode {number}",
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
  "player.autoMuted": "Started without sound — press M or the speaker to turn it on",
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

  "account.signIn": "Sign in",
  "account.signInGoogle": "Sign in with Google",
  "account.signOut": "Sign out",
  "account.menu": "Account",
  "account.history": "History",
  "account.signedInAs": "Signed in as {name}",
  "account.gateTitle": "Sign in to watch",
  "account.gateText":
    "Use your Google account. Catflix keeps your place in every film and series on all your devices.",
  "account.waiting": "Finish signing in in your browser…",
  "account.cancel": "Cancel",
  "account.offline": "Catflix could not reach its server",
  "account.offlineHint": "Check your connection and try again.",
  "account.notSetUp": "Sign-in is not set up on this server yet.",
  "account.synced": "Synced with your account",

  "history.title": "History",
  "history.emptyTitle": "Nothing watched yet",
  "history.emptyHint": "Films and series you watch show up here.",
  "history.guestHint": "Sign in to keep your history on all your devices.",
  "history.clear": "Clear history",

  "maker.create": "Create subtitle…",
  "maker.title": "Create a subtitle",
  "maker.from": "From",
  "maker.into": "Into",
  "maker.how": "How",
  "maker.translator": "Translator",
  "maker.translatorHint": "Free and quick",
  "maker.ai": "AI",
  "maker.aiHint": "Natural wording, in your tone",
  "maker.aiSignIn": "Sign in to use AI",
  "maker.aiUnavailable": "AI is not set up yet",
  "maker.tone": "Tone",
  "maker.customPlaceholder": "e.g. dramatic, like a radio play",
  "maker.start": "Create",
  "maker.back": "Back",
  "maker.working": "Creating… {percent}%",
  "maker.failed": "This subtitle could not be created",
  "maker.shared": "Ready for everyone who watches this",
  "maker.inProgress": "{percent}% done",

  "tone.formal": "Formal",
  "tone.neutral": "Neutral",
  "tone.casual": "Casual (gaul)",
  "tone.kids": "For kids",
  "tone.custom": "Custom",
};

export type Phrase = keyof typeof en;

const id: Record<Phrase, string> = {
  "nav.home": "Beranda",
  "nav.films": "Film",
  "nav.series": "Serial",
  "nav.anime": "Anime",
  "nav.drama": "Drama Asia",
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
  "search.anime": "Anime",
  "search.drama": "Drama Asia",

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

  "home.animeRail": "Anime untuk dicoba",
  "home.dramaRail": "Drama Asia",

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
  "browse.ongoing": "Sedang tayang",
  "browse.completed": "Tamat",

  "anime.popular": "Populer",
  "anime.ongoing": "Sedang tayang",
  "anime.newest": "Terbaru",
  "anime.az": "A–Z",
  "anime.error": "Catflix tidak dapat memuat daftar anime",
  "anime.emptyTitle": "Belum ada apa-apa di sini",
  "anime.emptyHint": "Pilih genre atau urutan lain untuk terus menjelajah.",
  "anime.episodes": "Episode",
  "anime.noEpisodes": "Anime ini belum punya daftar episode",

  "drama.kind": "Jenis",
  "drama.allKinds": "Semua",
  "drama.films": "Film",
  "drama.series": "Serial",
  "drama.region": "Wilayah",
  "drama.allRegions": "Semua wilayah",
  "drama.state": "Status",
  "drama.anyState": "Semua",
  "drama.error": "Catflix tidak dapat memuat daftar drama",
  "drama.emptyTitle": "Belum ada apa-apa di wilayah ini",
  "drama.emptyHint": "Pilih wilayah atau status lain untuk terus menjelajah.",

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
  "detail.anime": "Anime",
  "detail.drama": "Drama Asia",
  "detail.episodeName": "Episode {number}",
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
  "player.autoMuted": "Diputar tanpa suara — tekan M atau ikon speaker untuk menyalakannya",
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

  "account.signIn": "Masuk",
  "account.signInGoogle": "Masuk dengan Google",
  "account.signOut": "Keluar",
  "account.menu": "Akun",
  "account.history": "Riwayat",
  "account.signedInAs": "Masuk sebagai {name}",
  "account.gateTitle": "Masuk untuk menonton",
  "account.gateText": "Gunakan akun Google Anda. Catflix menyimpan posisi tontonan Anda di semua perangkat.",
  "account.waiting": "Selesaikan proses masuk di browser Anda…",
  "account.cancel": "Batal",
  "account.offline": "Catflix tidak dapat menjangkau servernya",
  "account.offlineHint": "Periksa koneksi Anda lalu coba lagi.",
  "account.notSetUp": "Fitur masuk belum diatur di server ini.",
  "account.synced": "Tersinkron dengan akun Anda",

  "history.title": "Riwayat",
  "history.emptyTitle": "Belum ada yang ditonton",
  "history.emptyHint": "Film dan serial yang Anda tonton akan muncul di sini.",
  "history.guestHint": "Masuk agar riwayat Anda tersimpan di semua perangkat.",
  "history.clear": "Hapus riwayat",

  "maker.create": "Buat subtitle…",
  "maker.title": "Buat subtitle",
  "maker.from": "Dari",
  "maker.into": "Ke",
  "maker.how": "Cara",
  "maker.translator": "Penerjemah",
  "maker.translatorHint": "Gratis dan cepat",
  "maker.ai": "AI",
  "maker.aiHint": "Bahasa alami, sesuai gaya pilihan Anda",
  "maker.aiSignIn": "Masuk untuk memakai AI",
  "maker.aiUnavailable": "AI belum diatur",
  "maker.tone": "Gaya bahasa",
  "maker.customPlaceholder": "mis. dramatis, seperti sandiwara radio",
  "maker.start": "Buat",
  "maker.back": "Kembali",
  "maker.working": "Membuat… {percent}%",
  "maker.failed": "Subtitle ini tidak dapat dibuat",
  "maker.shared": "Siap untuk semua yang menonton judul ini",
  "maker.inProgress": "{percent}% selesai",

  "tone.formal": "Formal",
  "tone.neutral": "Netral",
  "tone.casual": "Santai (gaul)",
  "tone.kids": "Untuk anak",
  "tone.custom": "Kustom",
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

/** `fromSync`: the choice came from another device and is already saved. */
export function setLanguage(next: Language, fromSync = false) {
  setCurrent(next);
  setChosen(true);
  if (!fromSync) savePrefs({ language: next });
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
