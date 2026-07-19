/** Shared Multer limits — keep fieldNestingDepth low (GHSA-72gw-mp4g-v24j). */
export const MULTER_SAFE_LIMITS = {
  fieldNestingDepth: 1,
  fields: 32,
} as const;

export function multerLimits(fileSize: number) {
  return {
    fileSize,
    ...MULTER_SAFE_LIMITS,
  };
}
