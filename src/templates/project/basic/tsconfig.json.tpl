{
  "compilerOptions": {
    "ignoreDeprecations": "6.0",
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

      "@tools/*": ["app/Tools/*"],
      "@httpClient/*": ["app/Tools/http/*"],
      "@templates": ["app/Tools/templates/index.ts"],
      "@templates/*": ["app/Tools/templates/*"],
      "@mail/*": ["app/Tools/mail/*"],
      "@storage": ["app/Tools/storage/index.ts"],
      "@storage/*": ["app/Tools/storage/*"],
      "@drivers/*": ["app/Tools/storage/drivers/*"],
      "@notification/*": ["app/Tools/notification/*"],
      "@broadcast/*": ["app/Tools/broadcast/*"],
      "@queue/*": ["app/Tools/queue/*"]
    }
  },
  "include": ["src/**/*", "app/**/*", "routes/**/*", "database/**/*"],
  "exclude": ["node_modules", "dist"]
}
