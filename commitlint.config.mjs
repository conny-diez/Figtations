/**
 * commitlint — enforces Conventional Commits on every commit message.
 * Invoked by the lefthook `commit-msg` hook; see lefthook.yml.
 *
 * The default `type-enum` from config-conventional (feat, fix, docs, style,
 * refactor, perf, test, build, ci, chore, revert) is exactly the set cliff.toml
 * routes into changelog sections, so the two stay in lockstep.
 *
 * @see https://commitlint.js.org
 * @type {import('@commitlint/types').UserConfig}
 */
export default {
  extends: ['@commitlint/config-conventional'],
}
