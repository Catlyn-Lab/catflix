import { A, Route, useLocation, useNavigate, type RouteSectionProps } from "@solidjs/router";
import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import Home from "./pages/Home";
import Browse from "./pages/Browse";
import Anime from "./pages/Anime";
import Drama from "./pages/Drama";
import History from "./pages/History";
import { AccountButton, SignInGate } from "./components/account";
import { account, accountStatus, loadAccount } from "./lib/account";
import { isNative } from "./lib/native";
import { startSync } from "./lib/sync";
import { installMediaApproval } from "./lib/media";
import SearchPage from "./pages/Search";
import Detail from "./pages/Detail";
import { WatchEpisode, WatchMovie } from "./pages/Watch";
import {
  Cat,
  FilmIcon,
  HomeIcon,
  LanguageDialog,
  LotusIcon,
  Search,
  SeriesIcon,
  SparkleIcon,
} from "./components/ui";
import { usesDpad } from "./lib/device";
import { languageChosen, t } from "./lib/i18n";
import { installSpatialNavigation } from "./lib/spatial";

function Shell(props: RouteSectionProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [typed, setTyped] = createSignal("");
  const [scrolled, setScrolled] = createSignal(false);
  // Asked once on first run; afterwards the language is changed from the Account menu.
  const languageOpen = () => !languageChosen();
  let main!: HTMLElement;

  const inPlayer = () => location.pathname.startsWith("/watch/");
  const section = () => {
    const path = location.pathname;
    if (path === "/") return "home";
    if (path.startsWith("/film") || path.startsWith("/movie")) return "films";
    if (path.startsWith("/series")) return "series";
    if (path.startsWith("/anime")) return "anime";
    if (path.startsWith("/drama")) return "drama";
    if (path.startsWith("/search")) return "search";
    return "";
  };
  const current = (name: string) => (section() === name ? "page" : undefined);

  onMount(() => {
    installMediaApproval();
    startSync();
    void loadAccount();

    // Reuse the remembered API host early so playback is not delayed.
    void import("./lib/api");

    if (usesDpad) {
      onCleanup(installSpatialNavigation(inPlayer));
      // The remote's Back button.
      const onBack = (event: KeyboardEvent) => {
        if (inPlayer() || event.defaultPrevented) return;
        const typing = (event.target as HTMLElement | null)?.tagName === "INPUT";
        if (event.key === "GoBack" || event.key === "BrowserBack" || (event.key === "Escape" && !typing)) {
          if (location.pathname !== "/") {
            event.preventDefault();
            history.back();
          }
        }
      };
      window.addEventListener("keydown", onBack);
      onCleanup(() => window.removeEventListener("keydown", onBack));
    }
  });

  // Every page starts at its top.
  createEffect(
    on(
      () => location.pathname,
      () => {
        main.scrollTop = 0;
        setScrolled(false);
      },
      { defer: true },
    ),
  );

  const submit = (event: Event) => {
    event.preventDefault();
    const term = typed().trim();
    if (term) navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <>
      {!inPlayer() && (
        <header class="topbar" data-scrolled={scrolled() || undefined}>
          <A class="brand" href="/" aria-label="Catflix">
            <Cat />
            <span>
              Cat<b>flix</b>
            </span>
          </A>
          <nav class="nav" aria-label={t("nav.sections")}>
            <A href="/" aria-current={current("home")}>
              {t("nav.home")}
            </A>
            <A href="/films" aria-current={current("films")}>
              {t("nav.films")}
            </A>
            <A href="/series" aria-current={current("series")}>
              {t("nav.series")}
            </A>
            <A href="/anime" aria-current={current("anime")}>
              {t("nav.anime")}
            </A>
            <A href="/drama" aria-current={current("drama")}>
              {t("nav.drama")}
            </A>
          </nav>
          <span class="spacer" />
          <Show when={section() !== "search"}>
            <form class="searchbox" role="search" onSubmit={submit}>
              <Search />
              <input
                type="search"
                enterkeyhint="search"
                placeholder={t("search.placeholder")}
                value={typed()}
                onInput={(event) => setTyped(event.currentTarget.value)}
                aria-label={t("search.label")}
              />
            </form>
          </Show>
          <A class="icon-btn topbar-search" href="/search" aria-label={t("search.label")}>
            <Search />
          </A>
          <AccountButton />
        </header>
      )}

      <main
        class="main"
        ref={main}
        data-player={inPlayer() || undefined}
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 24)}
      >
        {props.children}
      </main>

      {!inPlayer() && (
        <nav class="tabbar" aria-label={t("nav.sections")}>
          <A href="/" aria-current={current("home")}>
            <HomeIcon />
            <span>{t("nav.home")}</span>
          </A>
          <A href="/films" aria-current={current("films")}>
            <FilmIcon />
            <span>{t("nav.films")}</span>
          </A>
          <A href="/series" aria-current={current("series")}>
            <SeriesIcon />
            <span>{t("nav.series")}</span>
          </A>
          <A href="/anime" aria-current={current("anime")}>
            <SparkleIcon />
            <span>{t("nav.anime")}</span>
          </A>
          <A href="/drama" aria-current={current("drama")}>
            <LotusIcon />
            <span>{t("nav.drama")}</span>
          </A>
          <A href="/search" aria-current={current("search")}>
            <Search />
            <span>{t("nav.search")}</span>
          </A>
        </nav>
      )}

      <Show when={languageOpen()}>
        <LanguageDialog firstRun={!languageChosen()} onClose={() => undefined} />
      </Show>

      {/* The desktop app is for signed-in viewers; the website also welcomes guests. */}
      <Show when={isNative() && !languageOpen() && accountStatus() !== "checking" && !account()}>
        <SignInGate />
      </Show>
    </>
  );
}

export default function App() {
  return (
    <Route path="/" component={Shell}>
      <Route path="/" component={Home} />
      <Route path="/films" component={() => <Browse type="movie" />} />
      <Route path="/series" component={() => <Browse type="tv" />} />
      <Route path="/anime" component={Anime} />
      <Route path="/drama" component={Drama} />
      <Route path="/search" component={SearchPage} />
      <Route path="/history" component={History} />
      <Route path="/movie/:id" component={(p) => <Detail type="movie" id={p.params.id ?? ""} />} />
      <Route path="/series/:id" component={(p) => <Detail type="tv" id={p.params.id ?? ""} />} />
      <Route path="/anime/:id" component={(p) => <Detail type="anime" id={p.params.id ?? ""} />} />
      <Route path="/drama/:id" component={(p) => <Detail type="drama" id={p.params.id ?? ""} />} />
      <Route path="/watch/movie/:id" component={WatchMovie} />
      <Route path="/watch/episode/:seriesId/:season/:episode" component={WatchEpisode} />
      <Route path="/watch/episode/:kind/:seriesId/:season/:episode" component={WatchEpisode} />
      <Route path="*" component={Home} />
    </Route>
  );
}
