import { render } from "solid-js/web";
import { HashRouter } from "@solidjs/router";
import App from "./App";
import "./styles.css";

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
