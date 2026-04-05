import { zintrustAppEslintConfig } from '@zintrust/governance/eslint';

export default zintrustAppEslintConfig({
  enforcePathAliases: false,
  tsconfigRootDir: import.meta.dirname,
});
