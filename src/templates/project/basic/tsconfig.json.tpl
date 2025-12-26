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
      "@/*": ["./src/*"],
      "@app/*": ["./app/*"],
      "@config/*": ["./config/*"],
      "@routes/*": ["./routes/*"],
      "@database/*": ["./database/*"]
    }
  },
  "include": ["src/**/*", "app/**/*", "routes/**/*", "database/**/*", "config/**/*"],
  "exclude": ["node_modules", "dist"]
}
