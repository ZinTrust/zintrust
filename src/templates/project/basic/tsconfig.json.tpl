{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "strict": true,
    "skipLibCheck": true,
    "paths": {
      "@app/*": ["./app/*"],
      "@routes/*": ["./routes/*"]
    }
  },
  "include": ["src/**/*", "app/**/*", "routes/**/*", "database/**/*"],
  "exclude": ["node_modules", "dist"]
}
