declare module '*.json' {
  const value: {
    wizard_industries?: Record<string, string[]>;
    products?: unknown;
    [key: string]: unknown;
  };
  export default value;
}
