export function isRemoteFilesystem(scheme: string): boolean {
  return scheme === "abap" || scheme === "adt";
}
