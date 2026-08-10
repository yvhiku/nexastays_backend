/**
 * Safe build/release metadata for /version (no secrets).
 */
export function getReleaseMetadata(env: NodeJS.ProcessEnv = process.env) {
  return {
    service: env.NEXA_SERVICE_NAME || 'unknown',
    nexa_env: (env.NEXA_ENV || env.APP_ENV || '').trim() || null,
    node_env: env.NODE_ENV || null,
    version: (env.BUILD_VERSION || env.npm_package_version || '0.0.0').trim(),
    git_sha: (env.GIT_SHA || env.GITHUB_SHA || '').trim() || null,
    image_tag: (env.IMAGE_TAG || '').trim() || null,
    built_at: (env.BUILD_TIME || '').trim() || null,
  };
}
