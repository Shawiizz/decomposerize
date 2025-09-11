declare module 'composeverter' {
  export function yamlParse(input: string): any;
  export function migrateToCommonSpec(input: string): string;
  const defaultExport: {
    yamlParse: typeof yamlParse;
    migrateToCommonSpec: typeof migrateToCommonSpec;
  };
  export default defaultExport;
}
