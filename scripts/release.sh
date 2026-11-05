#!/usr/bin/env bash
# Releases go through a pull request, because main only accepts merged pull requests.
#
#   npm run release -- 0.2.0   on main: checks, version in every package, CHANGELOG.md,
#                              commit "chore(release): v0.2.0" on the branch release/v0.2.0
#                              and push it; then open the pull request and merge it.
#   npm run release:publish    after the merge: tag the release commit on main and push the tag,
#                              which starts the release workflow (Docker image, GitHub release).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

fail() { echo "$*" >&2; exit 1; }

require_clean_main() {
  [ "$(git branch --show-current)" = "main" ] || fail "Switch to main first."
  [ -z "$(git status --porcelain)" ] || fail "The working tree is not clean."
  git fetch -q --tags origin
}

repo_url() {
  git remote get-url origin | sed -E 's#^git@([^:]+):#https://\1/#; s#\.git$##'
}

prepare() {
  local version="${1:-}"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
    || fail "usage: npm run release -- <version>   (e.g. 0.2.0 or 0.2.0-rc.1)"
  local tag="v$version" branch="release/v$version"

  require_clean_main
  git merge -q --ff-only origin/main || fail "Local main has commits that are not on origin/main."
  ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null || fail "Tag $tag exists already."
  ! git ls-remote --exit-code --heads origin "$branch" >/dev/null || fail "Branch $branch exists on origin already."

  echo "• checks"
  local log
  log="$(mktemp)"
  npm run typecheck >"$log" 2>&1 || { tail -40 "$log" >&2; fail "Type check failed, see above."; }
  npm test >"$log" 2>&1 || { tail -40 "$log" >&2; fail "Tests failed, see above."; }
  rm -f "$log"

  git switch -q -c "$branch"
  echo "• version $version"
  npm version "$version" --no-git-tag-version --workspaces --include-workspace-root --allow-same-version >/dev/null
  echo "• CHANGELOG.md"
  npx --yes git-cliff@2.14.2 --config cliff.toml --tag "$tag" --output CHANGELOG.md 2>/dev/null

  git add package.json package-lock.json apps/*/package.json packages/*/package.json CHANGELOG.md
  git commit -q -m "chore(release): $tag"
  git push -q -u origin "$branch"
  git switch -q main

  echo
  echo "Branch $branch is pushed. Open the pull request, check CHANGELOG.md and merge it once CI is green:"
  echo "  $(repo_url)/compare/main...$branch?expand=1"
  echo "Then run: npm run release:publish"
}

publish() {
  require_clean_main
  git merge -q --ff-only origin/main || fail "Local main has commits that are not on origin/main."

  local version tag commit
  version="$(node -p 'require("./package.json").version')"
  tag="v$version"
  ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null || fail "$tag is released already. Prepare a new version with: npm run release -- <version>"
  # Merging rewrites the commit, so the tag goes on the merged commit, found by its message.
  commit="$(git log -1 --format=%H --grep="^chore(release): $tag\$" origin/main)"
  [ -n "$commit" ] || fail "No commit \"chore(release): $tag\" on main. Is the release pull request merged?"

  git tag -a "$tag" -m "$tag" "$commit"
  git push -q origin "$tag"
  git branch -q -D "release/$tag" 2>/dev/null || true

  echo "Tag $tag is pushed; the release workflow is running:"
  echo "  $(repo_url)/actions/workflows/release.yml"
}

case "${1:-}" in
  prepare) shift; prepare "$@" ;;
  publish) publish ;;
  *) fail "usage: release.sh prepare <version> | release.sh publish" ;;
esac
