import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { decomposerize: 'src/cli.ts' },
  format: ['cjs'],
  dts: false,
  sourcemap: false,
  clean: true,
  minify: false,
  external: ['composeverter'],
  target: 'node16',
  treeshake: true,
});
