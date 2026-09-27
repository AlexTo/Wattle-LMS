# Contributing Guidelines

Thank you for your interest in contributing to Discava. Whether it's a bug report, new feature, correction, or additional documentation, we greatly value feedback and contributions.

Please read through this document before submitting any issues or pull requests to ensure we have all the necessary information to effectively respond to your bug report or contribution. This is a young project, so for anything beyond a small fix, please open an issue to discuss the approach first; we'd hate for your time to be wasted.

## Reporting Bugs/Feature Requests

We welcome you to use the GitHub issue tracker to report bugs or suggest features.

When filing an issue, please check existing open, or recently closed, issues to make sure somebody else hasn't already reported it. Please try to include as much information as you can. Details like these are incredibly useful:

- A reproducible test case or series of steps
- The stage/environment you hit it in (`discava-development` vs `discava-production`, local vs deployed)
- Any modifications you've made relevant to the bug
- Anything unusual about your environment or setup

## Contributing via Pull Requests

Contributions via pull requests are much appreciated. Before sending us a pull request, please ensure that:

1. You are working against the latest source on the `main` branch.
2. You check existing open, and recently merged, pull requests to make sure someone else hasn't already addressed the problem.
3. You open an issue to discuss any significant work.

To send us a pull request, please:

1. Fork the repository, and install dependencies with `pnpm i`.
2. Modify the source; please focus on the specific change you are contributing. If you also reformat unrelated code, it will be hard for us to review your change.
3. Run the full build locally before pushing: `pnpm build` (this chains lint, compile, test, and bundle/synth/checkov per project). For a faster loop while iterating, target one project, or run `pnpm nx affected --target <lint|test|build>` to only touch what your change affects, the same way CI's PR checks do.
4. Commit using `git commit` as usual; the `prepare-commit-msg` hook runs [Commitizen](https://commitizen.github.io/cz-cli/) to build a [Conventional Commits](https://www.conventionalcommits.org) message interactively, and `commitlint` enforces it on `commit-msg`. PR titles follow the same convention.
5. Send us a pull request, and keep an eye on CI. `pr-checks.yml` runs lint/test/build against your changes; stay involved if anything reports a failure.

GitHub provides additional documentation on [forking a repository](https://help.github.com/articles/fork-a-repo/) and [creating a pull request](https://help.github.com/articles/creating-a-pull-request/).

### Adding a New Project or Component

Prefer the [Nx Plugin for AWS](https://awslabs.github.io/nx-plugin-for-aws) generators over hand-scaffolding. That's how every existing package in this repo (`core-api`, `core-table`, the portals, `infra`) was created, and it keeps generated projects consistent and eligible for future `nx migrate` upgrades. If you have the `nx-plugin-for-aws` MCP server available, use `list-generators` / `generator-guide` to find the right one; otherwise check the [generator docs](https://awslabs.github.io/nx-plugin-for-aws/en/guides/).

### Code Style and License Headers

[Biome](https://biomejs.dev) formats and lints this codebase (single quotes, trailing commas, 80-column width); `pnpm lint` runs it with `--configuration=fix`. Every source file, except generated output, translated docs, and `.astro` files, carries an Apache-2.0 SPDX header, written by the `license#sync` Nx sync generator (configured in [aws-nx-plugin.config.mts](aws-nx-plugin.config.mts)). Please don't hand-edit headers; `pnpm lint` and `pnpm build` keep them in sync for you.

### Writing Documentation

Docs live in `docs/` (Astro + Starlight, deployed to GitHub Pages). Please only author English content, under `docs/src/content/docs/en/`; other locales are generated from it, not hand-written.

To translate your changes locally, with AWS credentials configured for Bedrock access:

```sh
pnpm nx run @discava/docs:translate            # translate files changed vs main
pnpm nx run @discava/docs:translate -- --all   # translate everything
pnpm nx run @discava/docs:translate -- --dry-run
```

There is no CI workflow that runs this automatically yet. If your PR touches English docs, please run the translation locally and commit the result, or note in the PR that translations are pending.

## Finding Contributions to Work On

Looking at the existing issues is a great way to find something to contribute. Take a look at any [`good first issue`](https://github.com/AlexTo/discava/labels/good%20first%20issue) or [`help wanted`](https://github.com/AlexTo/discava/labels/help%20wanted) issues to get started.

## Code of Conduct

This project has adopted the [Contributor Covenant](CODE_OF_CONDUCT.md). Please read it before participating, and report unacceptable behavior as described there.

## Security Issue Notifications

See [SECURITY.md](SECURITY.md) for how to report a potential security issue. Please do not open a public GitHub issue for it.

## Licensing

See the [LICENSE](LICENSE) file for our project's licensing (Apache License 2.0). We will ask you to confirm the licensing of your contribution.
