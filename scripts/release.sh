#!/usr/bin/env bash
# Prepares a release: sets the version in every package, updates CHANGELOG.md,
# commits "chore(release): vX.Y.Z" and creates the tag. Nothing is pushed.
#   npm run release -- 0.2.0
set -euo pipefail

version="${1:-}"
if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "usage: npm run release -- <version>   (e.g. 0.2.0 or 0.2.0-rc.1)" >&2
  exit 1
fi
tag="v$version"

cd "$(git rev-parse --show-toplevel)"
if [ "$(git branch --show-current)" != "main" ]; then echo "Releases are made from main." >&2; exit 1; fi
if [ -n "$(git status --porcelain)" ]; then echo "The working tree is not clean." >&2; exit 1; fi
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then echo "Tag $tag exists already." >&2; exit 1; fi

echo "• checks"
npm run typecheck >/dev/null
npm test >/dev/null

echo "• version $version"
npm version "$version" --no-git-tag-version --workspaces --include-workspace-root --allow-same-version >/dev/null

echo "• CHANGELOG.md"
npx --yes git-cliff@2.14.2 --config cliff.toml --tag "$tag" --output CHANGELOG.md

git add package.json package-lock.json apps/*/package.json packages/*/package.json CHANGELOG.md
git commit -q -m "chore(release): $tag"
git tag -a "$tag" -m "$tag"

echo
echo "Release $tag is ready. Check CHANGELOG.md, then publish it with:"
echo "  git push origin main $tag"
