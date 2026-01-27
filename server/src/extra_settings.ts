export type ExtraSettings = {
  codeLens?: any,
  inlayHints?: any,
  outline?: {
    disableForRemoteFilesystems?: boolean,
  },
  activeTextEditorUri?: string | undefined,
  fallbackThreshold?: number,
  localConfigPath?: string,
};
