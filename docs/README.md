# @discava/docs

Documentation site generated with [@aws/nx-plugin](https://github.com/awslabs/nx-plugin-for-aws/),
powered by [Astro](https://astro.build/) and [Starlight](https://starlight.astro.build/).

## Run locally

```bash
pnpm nx start @discava/docs
```

## Build for production

```bash
pnpm nx build @discava/docs
```

## Preview the production build

```bash
pnpm nx preview @discava/docs
```

## Translate documentation

This project is pre-wired with a translation script that uses a
[Strands Agent](https://strandsagents.com/) powered by Claude on
[Amazon Bedrock](https://aws.amazon.com/bedrock/) to translate documentation from
the source language (`en` by default) into every locale listed in
`scripts/translate.config.json`.

By default the `targetLanguages` list is empty — add the locale codes you want
to ship, for example:

```json
"targetLanguages": ["fr", "de", "es", "ja", "ko"]
```

Make sure each locale you list is also configured in `astro.config.mjs` under
`locales`.

Run the translator manually with:

```bash
pnpm nx translate @discava/docs -- --all
```

Translate only the files that changed since the last `docs: update translations`
commit:

```bash
pnpm nx translate @discava/docs
```

Other options in `scripts/translate.config.json`:

- `include` / `exclude` — glob patterns for docs files, relative to the source
  language directory.
- `modelId` — Bedrock model id.
- `awsRegion` — Bedrock region; can be overridden with the `AWS_REGION` env var.
- `concurrency` — cap on concurrent Bedrock requests (one agent per file ×
  target language).

