import { render } from "solid-js/web";
import { HashRouter } from "@solidjs/router";
import "@fontsource-variable/bricolage-grotesque/wdth.css";
import "@fontsource-variable/onest";
import App from "./App";
import { markDevice } from "./lib/device";
import "./styles.css";

markDevice();

const root = document.getElementById("root");
if (root) {
  render(
    () => (
      <HashRouter>
        <App />
      </HashRouter>
    ),
    root,
  );
}
