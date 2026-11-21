import { A, Route, useLocation, useNavigate, type RouteSectionProps } from "@solidjs/router";
import { createSignal, onMount } from "solid-js";
import Home from "./pages/Home";
import Browse from "./pages/Browse";
import SearchPage from "./pages/Search";
import Detail from "./pages/Detail";
import { WatchEpisode, WatchMovie } from "./pages/Watch";
import { Cat, Search } from "./components/ui";

function Shell(props: RouteSectionProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [typed, setTyped] = createSignal("");

  onMount(() => {
    // Reuse the remembered API host early so playback is not delayed.
    void import("./lib/api");
  });

  const inPlayer = () => location.pathname.startsWith("/watch/");

  const submit = (event: Event) => {
    event.preventDefault();
    const term = typed().trim();
    if (term) navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <>
      {!inPlayer() && (
        <header class="topbar">
          <A class="brand" href="/">
            <Cat /> Cat<b>flix</b>
          </A>
          <nav class="nav">
            <A href="/" data-current={location.pathname === "/" || undefined}>
              Home
            </A>
            <A href="/films" data-current={location.pathname.startsWith("/film") || undefined}>
              Films
            </A>
            <A href="/series" data-current={location.pathname.startsWith("/series") || undefined}>
              Series
            </A>
          </nav>
          <span class="spacer" />
          <form class="searchbox" onSubmit={submit}>
            <Search />
            <input
              placeholder="Search films and series"
              value={typed()}
              onInput={(event) => setTyped(event.currentTarget.value)}
              aria-label="Search"
            />
          </form>
        </header>
      )}
      <main class="main">{props.children}</main>
    </>
  );
}

export default function App() {
  return (
    <Route path="/" component={Shell}>
      <Route path="/" component={Home} />
      <Route path="/films" component={() => <Browse type="movie" />} />
      <Route path="/series" component={() => <Browse type="tv" />} />
      <Route path="/search" component={SearchPage} />
      <Route path="/movie/:id" component={(p) => <Detail type="movie" id={p.params.id ?? ""} />} />
      <Route path="/series/:id" component={(p) => <Detail type="tv" id={p.params.id ?? ""} />} />
      <Route path="/watch/movie/:id" component={WatchMovie} />
      <Route path="/watch/episode/:seriesId/:season/:episode" component={WatchEpisode} />
      <Route path="*" component={Home} />
    </Route>
  );
}
