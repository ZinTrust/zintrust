{
  "compilerOptions": {
    "baseUrl": ".",
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
      "@toolkit/*": ["./app/Toolkit/*"],
      "@config/*": ["./config/*"],
      "@routes/*": ["./routes/*"],
      "@database/*": ["./database/*"],

      "@tools/*": ["./src/tools/*"],
      "@httpClient/*": ["./src/tools/http/*"],
      "@templates": ["./src/tools/templates/index.ts"],
      "@templates/*": ["./src/tools/templates/*"],
      "@mail/*": ["./src/tools/mail/*"],
      "@storage": ["./src/tools/storage/index.ts"],
      "@storage/*": ["./src/tools/storage/*"],
      "@drivers/*": ["./src/tools/storage/drivers/*"],
      "@notification/*": ["./src/tools/notification/*"],
      "@broadcast/*": ["./src/tools/broadcast/*"],
      "@queue/*": ["./src/tools/queue/*"]
    }
  },
  "include": ["src/**/*", "app/**/*", "routes/**/*", "database/**/*", "config/**/*"],
  "exclude": ["node_modules", "dist"]
}
