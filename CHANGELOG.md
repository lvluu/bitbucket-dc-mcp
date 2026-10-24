# Changelog

## [1.7.0](https://github.com/lvluu/bitbucket-dc-mcp/compare/v1.6.0...v1.7.0) (2026-10-24)


### Features

* **http:** expire idle MCP sessions and cap session count ([#29](https://github.com/lvluu/bitbucket-dc-mcp/issues/29)) ([9aa8a88](https://github.com/lvluu/bitbucket-dc-mcp/commit/9aa8a8881489b8f41198fec0713d506ac3983f64)), closes [#19](https://github.com/lvluu/bitbucket-dc-mcp/issues/19)


### Bug Fixes

* add request timeout to the Bitbucket client ([#27](https://github.com/lvluu/bitbucket-dc-mcp/issues/27)) ([1e33ccf](https://github.com/lvluu/bitbucket-dc-mcp/commit/1e33ccf17f71f106141634173dccb34f472f5c12))
* bind HTTP mode to loopback by default, optional bearer auth ([#33](https://github.com/lvluu/bitbucket-dc-mcp/issues/33)) ([f2044d9](https://github.com/lvluu/bitbucket-dc-mcp/commit/f2044d9c7292abdbc3ffee11f3d56f9fe3159fa5))
* discover .ts tool modules so bun run dev registers tools ([#23](https://github.com/lvluu/bitbucket-dc-mcp/issues/23)) ([90ae40b](https://github.com/lvluu/bitbucket-dc-mcp/commit/90ae40bd03c4d66acea21586e224f466467f740e))
* do not combine CORS credentials with a wildcard origin ([#25](https://github.com/lvluu/bitbucket-dc-mcp/issues/25)) ([74e053c](https://github.com/lvluu/bitbucket-dc-mcp/commit/74e053c7724fc8da3b4c71de2d3a5a05899ef9ea)), closes [#9](https://github.com/lvluu/bitbucket-dc-mcp/issues/9)
* encode file paths, project/repo and commit ids in URLs ([#32](https://github.com/lvluu/bitbucket-dc-mcp/issues/32)) ([c933602](https://github.com/lvluu/bitbucket-dc-mcp/commit/c933602cb75e4b2838a1628e5b5abb721e757e99))
* encode project/repo in the branch-utils and webhooks URLs ([#37](https://github.com/lvluu/bitbucket-dc-mcp/issues/37)) ([3850e98](https://github.com/lvluu/bitbucket-dc-mcp/commit/3850e983ca7acb0b55732c93e4a9206bd81317ce))
* finishReview sets reviewStatus even with no buffered comments ([#22](https://github.com/lvluu/bitbucket-dc-mcp/issues/22)) ([80a813b](https://github.com/lvluu/bitbucket-dc-mcp/commit/80a813b66c4f02684a072341156e8d96eb76e058)), closes [#6](https://github.com/lvluu/bitbucket-dc-mcp/issues/6)
* getCommitDiff accepts optional path for the {path} segment ([#20](https://github.com/lvluu/bitbucket-dc-mcp/issues/20)) ([c04a3a0](https://github.com/lvluu/bitbucket-dc-mcp/commit/c04a3a08cf249b8e57be93ffdfc173996246ead6))
* keep reverse-proxy context path in BITBUCKET_URL handling ([#21](https://github.com/lvluu/bitbucket-dc-mcp/issues/21)) ([2ebecd9](https://github.com/lvluu/bitbucket-dc-mcp/commit/2ebecd9eba541048342457592500e48eaf2bbc10)), closes [#5](https://github.com/lvluu/bitbucket-dc-mcp/issues/5)
* **merge-queue:** partial-merge report, dequeue by prId, serialized processing, dedupe ([#38](https://github.com/lvluu/bitbucket-dc-mcp/issues/38)) ([7fddb1a](https://github.com/lvluu/bitbucket-dc-mcp/commit/7fddb1a070767c32ecc9b4dec730f51a96a7802d))
* one MCP session per HTTP client instead of a shared transport ([#18](https://github.com/lvluu/bitbucket-dc-mcp/issues/18)) ([3a71d75](https://github.com/lvluu/bitbucket-dc-mcp/commit/3a71d75474b984b1969f80d3c6f4526a91365d26))
* package.json bin path for npm publish ([5eea0ce](https://github.com/lvluu/bitbucket-dc-mcp/commit/5eea0ce4b1909682a0c05180c3711891ed6b8d22))
* **review:** scope review sessions to the owning MCP session and expire them ([#39](https://github.com/lvluu/bitbucket-dc-mcp/issues/39)) ([52ab1a3](https://github.com/lvluu/bitbucket-dc-mcp/commit/52ab1a33276687523bce61396d2800c5d01ed4fd))
* skip reviewStatus in finishReview when every buffered comment failed ([#28](https://github.com/lvluu/bitbucket-dc-mcp/issues/28)) ([8dd55ea](https://github.com/lvluu/bitbucket-dc-mcp/commit/8dd55eafbc1d591175e2454033525476148fd780))
* squeeze addPullRequestReviewers all-failed result via jsonResult ([#26](https://github.com/lvluu/bitbucket-dc-mcp/issues/26)) ([49785b7](https://github.com/lvluu/bitbucket-dc-mcp/commit/49785b7bfddc09e4cabe26467fd634c9f9bbc011)), closes [#11](https://github.com/lvluu/bitbucket-dc-mcp/issues/11)

## [1.6.0](https://github.com/lvluu/bitbucket-dc-mcp/compare/v1.5.1...v1.6.0) (2026-10-17)


### Features

* add listRepositoryWebhooks tool ([#14](https://github.com/lvluu/bitbucket-dc-mcp/issues/14)) ([0cd8b8d](https://github.com/lvluu/bitbucket-dc-mcp/commit/0cd8b8dd2f3f9988efea9d296cec48d3e8f46897))
* add per-repository merge queue tools ([#12](https://github.com/lvluu/bitbucket-dc-mcp/issues/12)) ([1cbfa09](https://github.com/lvluu/bitbucket-dc-mcp/commit/1cbfa09918c38afe6bae1e3d8f9e9161641e4f5d))


### Performance Improvements

* squeeze tool results (compact JSON, strip noise, cap text); add CLAUDE.md ([a9024bc](https://github.com/lvluu/bitbucket-dc-mcp/commit/a9024bc5a3dd7c7c8397bfd451bad68d07a3b3d1))

## [1.5.0](https://github.com/lvluu/bitbucket-dc-mcp/compare/v1.4.1...v1.5.0) (2026-10-16)


### Features

* add listRepositoryWebhooks tool ([#14](https://github.com/lvluu/bitbucket-dc-mcp/issues/14)) ([0cd8b8d](https://github.com/lvluu/bitbucket-dc-mcp/commit/0cd8b8dd2f3f9988efea9d296cec48d3e8f46897))
* add per-repository merge queue tools ([#12](https://github.com/lvluu/bitbucket-dc-mcp/issues/12)) ([1cbfa09](https://github.com/lvluu/bitbucket-dc-mcp/commit/1cbfa09918c38afe6bae1e3d8f9e9161641e4f5d))

## [1.4.1](https://github.com/lvluu/bitbucket-dc-mcp/compare/v1.4.0...v1.4.1) (2026-10-15)


### Performance Improvements

* squeeze tool results (compact JSON, strip noise, cap text); add CLAUDE.md ([a9024bc](https://github.com/lvluu/bitbucket-dc-mcp/commit/a9024bc5a3dd7c7c8397bfd451bad68d07a3b3d1))
