/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_CATALOGUE_HOSTS?: string;
  readonly VITE_ANIME_BRIDGE?: string;
  readonly VITE_ANIME_SITE?: string;
  readonly VITE_DRAMA_SITE?: string;
  readonly VITE_DRAMA_PLAYLISTS?: string;
  readonly VITE_READER_URL?: string;
  readonly VITE_DIRECT_HOSTS?: string;
  readonly VITE_LOCKED_HOSTS?: string;
  readonly VITE_LOCKED_REFERER?: string;
}
