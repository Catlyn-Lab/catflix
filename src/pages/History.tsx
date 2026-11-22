import { createResource, For, Show } from "solid-js";
import type { Item } from "../lib/api";
import { account, call, canSignIn, signIn } from "../lib/account";
import { t } from "../lib/i18n";
import { recent } from "../lib/store";
import { Card, Empty, SkeletonGrid } from "../components/ui";

type Row = { titleKey: string; title?: string | null; poster?: string | null; watchedAt: number };

/** "movie:42" / "tv:42" / "anime:42" / "drama:slug" → a card for the title. */
const toItem = (row: Row): Item | null => {
  const [kind, ...rest] = row.titleKey.split(":");
  const id = rest.join(":");
  if (!id || !row.title) return null;
  const type = kind === "movie" ? "movie" : kind === "anime" ? "anime" : kind === "drama" ? "drama" : "tv";
  return { id, type, title: row.title, image: row.poster ?? null };
};

/** A guest's history: the titles watched on this device, newest first. */
const localRows = (): Row[] => {
  const rows = new Map<string, Row>();
  for (const { type, id, record } of recent()) {
    const parts = id.split(":");
    const titleKey =
      type === "movie"
        ? `movie:${id}`
        : parts[0] === "anime" || parts[0] === "drama"
          ? `${parts[0]}:${parts[1]}`
          : `tv:${parts[0]}`;
    if (!rows.has(titleKey)) {
      rows.set(titleKey, {
        titleKey,
        title: record.title,
        poster: record.poster,
        watchedAt: record.updatedAt,
      });
    }
  }
  return [...rows.values()];
};

export default function History() {
  // Keyed by an object so guests (no id) still get their local history.
  const [rows] = createResource(
    () => ({ user: account()?.id }),
    async ({ user: signedIn }) => {
      if (!signedIn) return localRows();
      const response = await call("/sync/history");
      return response.ok ? ((await response.json()) as { items: Row[] }).items : localRows();
    },
  );
  const items = () => (rows() ?? []).map(toItem).filter((item): item is Item => item !== null);

  return (
    <div class="wrap">
      <header class="page-head">
        <h1>{t("history.title")}</h1>
      </header>
      <Show when={!account() && canSignIn()}>
        <p class="result-count">
          {t("history.guestHint")}{" "}
          <button class="link-btn" onClick={() => void signIn()}>
            {t("account.signIn")}
          </button>
        </p>
      </Show>
      <Show when={!rows.loading} fallback={<SkeletonGrid />}>
        <Show
          when={items().length}
          fallback={<Empty title={t("history.emptyTitle")} hint={t("history.emptyHint")} />}
        >
          <div class="grid">
            <For each={items()}>{(item) => <Card item={item} />}</For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
