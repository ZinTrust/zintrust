declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'testing';

    USE_RAW_QRY: string | undefined;
    SERVICE_API_KEY: string;
    SERVICE_JWT_SECRET: string;
    BASE_URL: string;
    MODE: string;
  }
}

// Vite-specific ImportMeta interface for import.meta.env
interface ImportMetaEnv {
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly NODE_ENV: 'development' | 'production' | 'testing';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
