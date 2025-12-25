declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'testing' | undefined;

    USE_RAW_QRY: string | undefined;
    SERVICE_API_KEY: string;
    SERVICE_JWT_SECRET: string;
    BASE_URL: string;
    MODE: string;
    APP_PORT: string;
  }
}

// Vite-specific ImportMeta interface for import.meta.env
interface ImportMetaEnv {
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly APP_PORT: string;
  readonly NODE_ENV: 'development' | 'production' | 'testing';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
