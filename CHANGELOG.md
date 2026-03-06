# Changelog

## [1.4.0](https://github.com/lvluu/bitbucket-dc-mcp/compare/v1.3.0...v1.4.0) (2026-03-06)


### Features

* default listPRComments to unresolved comments only ([98bf1e9](https://github.com/lvluu/bitbucket-dc-mcp/commit/98bf1e9ad6c26730a244f7c262f1b1547a8143f0))

## [1.3.0](https://github.com/lvluu/bitbucket-dc-mcp/compare/v1.2.0...v1.3.0) (2026-02-11)


### Features

* add response summarization to list endpoints for reduced token usage ([01fcc1c](https://github.com/lvluu/bitbucket-dc-mcp/commit/01fcc1c9068e168f7099790feafd2d319db3863f))


### Bug Fixes

* skip integration tests in CI when Bitbucket credentials are unavailable ([078783f](https://github.com/lvluu/bitbucket-dc-mcp/commit/078783fb5adb373500845dbb88f9e33a4393e4fa))

## [1.2.0](https://github.com/lvluu/bitbucket-dc-mcp/compare/v1.1.0...v1.2.0) (2026-02-11)


### Features

* add PR review session tools with buffered comments ([73811e4](https://github.com/lvluu/bitbucket-dc-mcp/commit/73811e4009eb1be951f462a3496ede98943c1481))


### Bug Fixes

* use z.coerce.number() for MCP string-to-number coercion and fix build status API paths ([d2dc86b](https://github.com/lvluu/bitbucket-dc-mcp/commit/d2dc86ba605bc504c1cb8c72736101b5ee0694ab))

## [1.1.0](https://github.com/lvluu/bitbucket-dc-mcp/compare/v1.0.2...v1.1.0) (2026-02-11)


### Features

* add addPullRequestReviewers tool to assign reviewers to existing PRs ([6a227ee](https://github.com/lvluu/bitbucket-dc-mcp/commit/6a227ee868c94e219475b53c00c4ab4b4d9f41c0))
* add build status tools and update README ([9486e75](https://github.com/lvluu/bitbucket-dc-mcp/commit/9486e75abe060a65f2362f60eb697f884777b94b))

## [1.0.1](https://github.com/lvluu/bitbucket-dc-mcp/compare/v1.0.0...v1.0.1) (2026-02-10)


### Bug Fixes

* remove --provenance flag for private repo publishing ([3f70a27](https://github.com/lvluu/bitbucket-dc-mcp/commit/3f70a27e4760fde6e370890846cdfee9285d14e6))

## 1.0.0 (2026-02-10)


### Features

* add functionality to mark pull requests as draft and update instructions ([77d0078](https://github.com/lvluu/bitbucket-dc-mcp/commit/77d0078d8acab4d1bedf4c328b7d64b56f3257d7))
* integrate release-please for automated versioning ([5d021e8](https://github.com/lvluu/bitbucket-dc-mcp/commit/5d021e84d756dfb54771459663b579b4e4eeba44))


### Bug Fixes

* make lint non-blocking in CI ([fd3c157](https://github.com/lvluu/bitbucket-dc-mcp/commit/fd3c15731f5f31d22e6a0a780e200b335c149e2e))
* use scoped npm package name @shibainu16/bitbucket-dc-mcp ([2a3dd41](https://github.com/lvluu/bitbucket-dc-mcp/commit/2a3dd41332f6b50673bce055c9f6caf4d0cde846))
