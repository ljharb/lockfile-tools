# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0](https://github.com/ljharb/lockfile-tools/compare/eslint-plugin-lockfile@1.3.0...eslint-plugin-lockfile@1.4.0) - 2026-05-27

### Commits

- [plugin] [new] add `tracked` rule [`2f2bef9`](https://github.com/ljharb/lockfile-tools/commit/2f2bef94be5364b729faba442a7474571428ebe2)
- [plugin] v1.4.0 [`c86d014`](https://github.com/ljharb/lockfile-tools/commit/c86d01420df94455652cb0b8d8edc53b9324cdca)
- [plugin] [deps] update `semver` [`7943ff2`](https://github.com/ljharb/lockfile-tools/commit/7943ff28cd6974bda066dcc6ea7f41a0a78f2e1c)

## [1.3.0](https://github.com/ljharb/lockfile-tools/compare/eslint-plugin-lockfile@1.2.0...eslint-plugin-lockfile@1.3.0) - 2026-05-12

### Commits

- [cli, plugin, tools] [new] add eslint 10 support [`e067108`](https://github.com/ljharb/lockfile-tools/commit/e067108a452cb39e3cfc8df2fc210506b8d41042)
- [plugin] v1.3.0 [`6c79f9f`](https://github.com/ljharb/lockfile-tools/commit/6c79f9f0c916480c22785b7381253b1dea24b171)
- [meta] [new] cover ESLint 8 + 9 across lowest/latest in a CI matrix [`1c1dc21`](https://github.com/ljharb/lockfile-tools/commit/1c1dc21671728ee208625f041790bd7008056471)
- [plugin] [deps] update `lockfile-tools` [`24ef026`](https://github.com/ljharb/lockfile-tools/commit/24ef0264877f82632073a1f1047def6570ba62c8)

## [1.2.0](https://github.com/ljharb/lockfile-tools/compare/eslint-plugin-lockfile@1.1.1...eslint-plugin-lockfile@1.2.0) - 2026-05-11

### Commits

- [plugin] [fix] surface non-E404 pacote failures via a fetchFailed diagnostic [`d2d848f`](https://github.com/ljharb/lockfile-tools/commit/d2d848fc8661e76bae2300ca5fe64fe419939f34)
- [plugin] [new] gate pacote network egress behind an allowedHosts option [`206176d`](https://github.com/ljharb/lockfile-tools/commit/206176d92cbf60b526e763bf83a488769261fa88)
- [*] general docs/types cleanup [`946b43d`](https://github.com/ljharb/lockfile-tools/commit/946b43d09740424f8097640f3577e6418d79559d)
- [plugin] [refactor] coalesce pacote manifest fetches across rules [`8c2fb34`](https://github.com/ljharb/lockfile-tools/commit/8c2fb344009d571a3ce9c0f2b3179f89c1d3e741)
- [plugin] v1.2.0 [`b88e365`](https://github.com/ljharb/lockfile-tools/commit/b88e365ec22a2e6d86218ac91c374270125a63c6)
- [plugin] [deps] update `lockfile-tools` [`e744810`](https://github.com/ljharb/lockfile-tools/commit/e7448103778f92d81c9b5d4130aaacebbf6a9a9c)

## [1.1.1](https://github.com/ljharb/lockfile-tools/compare/eslint-plugin-lockfile@1.1.0...eslint-plugin-lockfile@1.1.1) - 2026-05-08

### Commits

- [plugin] [refactor] walk JSON lockfiles via momoa AST [`06eb682`](https://github.com/ljharb/lockfile-tools/commit/06eb68264110a870dc086ca64b872b742d4b484f)
- [plugin] [fix] honor piped/in-memory lockfile content [`a6d0dde`](https://github.com/ljharb/lockfile-tools/commit/a6d0dde70f8c2e4ec224777b0379471a4e78cc7a)
- [plugin] [refactor] cache static builtins at module level [`6064cba`](https://github.com/ljharb/lockfile-tools/commit/6064cba8950f21ea12e5ea71dbfd3f5cd31921db)
- [eslint plugin] [docs] update rule docs [`898c7d4`](https://github.com/ljharb/lockfile-tools/commit/898c7d4bbdc751300d7adc63d1a075a2bbd61540)
- [plugin] [fix] attach noop parser to recommended flat config [`0bbe61f`](https://github.com/ljharb/lockfile-tools/commit/0bbe61f81f97ec1e1cb4476c24f1418c14244f8d)
- [plugin] [fix] strip leading `node_modules/` from reported package names [`9ffac3f`](https://github.com/ljharb/lockfile-tools/commit/9ffac3f9a905df847a8c2ee08378baa46a00564f)
- [plugin] v1.1.1 [`d7e93ed`](https://github.com/ljharb/lockfile-tools/commit/d7e93ed9576b6f9d96ad99d4f48f387f7c84f6c4)
- [eslint plugin] [fix] fix rule docs urls [`4b0d1ac`](https://github.com/ljharb/lockfile-tools/commit/4b0d1ac83e719a23c0437a88a1c9940518859118)
- [plugin] [deps] update `lockfile-tools`, `minimatch`, `pacote`, `semver` [`c1a6f3b`](https://github.com/ljharb/lockfile-tools/commit/c1a6f3b62941f8c5ed4db341cc32dc99b3af0dfc)
- [plugin] [dev deps] update `@eslint/core`, `auto-changelog`, `eslint-doc-generator` [`e396de0`](https://github.com/ljharb/lockfile-tools/commit/e396de0062ded906abb2adc284369e5b26fad7bb)

## [1.1.0](https://github.com/ljharb/lockfile-tools/compare/eslint-plugin-lockfile@1.0.0...eslint-plugin-lockfile@1.1.0) - 2026-01-28

### Commits

- [plugin] [new] add `shrinkwrap` rule [`f61b54f`](https://github.com/ljharb/lockfile-tools/commit/f61b54f076f25bd158785a197149b3df7779e08b)
- [*] [tests] increase coverage [`abd6a7f`](https://github.com/ljharb/lockfile-tools/commit/abd6a7f412bc34fe0cbb2d043389bd04b75e7e0f)
- [plugin] [refactor] avoid for-of [`6f36b77`](https://github.com/ljharb/lockfile-tools/commit/6f36b777c9a43ff0d9d651977334a02840290c51)
- [plugin] v1.1.0 [`eec0659`](https://github.com/ljharb/lockfile-tools/commit/eec0659352538355a2fb26d5f061ff255abdc0fb)
- [plugin, tools] [refactor] use arborist’s .forEach [`cf7b30e`](https://github.com/ljharb/lockfile-tools/commit/cf7b30e79fc9b014cd9d02e1f35b830307acf20d)
- [*] [dev deps] update `@types/npmcli__arborist`, `@eslint/core`, `npmignore` [`ae9ccf7`](https://github.com/ljharb/lockfile-tools/commit/ae9ccf7a1e1bd65d0a039b7fc2b755f3fe4fad2b)
- [plugin] [deps] update `lockfile-tools` [`26f9970`](https://github.com/ljharb/lockfile-tools/commit/26f997021a20f86f55807949e80e8035a150bee8)

## 1.0.0 - 2025-12-21

### Commits

- [plugin] [new] Add `registry` rule to enforce allowed npm registries [`3940e95`](https://github.com/ljharb/lockfile-tools/commit/3940e952a2e75c05132a64dd991cf78a4da115a8)
- [plugin] [new] Add `integrity` rule to enforce package integrity hashes [`ba136ae`](https://github.com/ljharb/lockfile-tools/commit/ba136aea42a9315539589237112cc2f2bc53f63e)
- [plugin] [new] Add `binary-conflicts` rule to detect binary name conflicts [`8a344fd`](https://github.com/ljharb/lockfile-tools/commit/8a344fddffb2e45fbecf054453c0bb27be639411)
- [plugin] [new] Add `version` rule to enforce lockfile versions [`7572e32`](https://github.com/ljharb/lockfile-tools/commit/7572e324a13ab849442a76c5d1c64a7af5ca10a8)
- [plugin] [new] Add `non-registry-specifiers` rule to warn on non-registry dependencies [`f46776f`](https://github.com/ljharb/lockfile-tools/commit/f46776f9d50daeac20907b0e37182d703aeb3487)
- [plugin] [new] Add `flavor` rule to enforce allowed package managers [`7a2b652`](https://github.com/ljharb/lockfile-tools/commit/7a2b652ac806f03a7523242dddcfdbd71c4cbe5e)
- initial project setup [`80cf26f`](https://github.com/ljharb/lockfile-tools/commit/80cf26f2dedc7843f0d07229709e417fadc0cadb)
- [Fix] fix line number reporting [`2a08423`](https://github.com/ljharb/lockfile-tools/commit/2a0842300b9f8781937176ae750b502b707157b9)
- [plugin] Add main plugin exports and recommended config [`f2e8bc1`](https://github.com/ljharb/lockfile-tools/commit/f2e8bc1de4823e5ad830c8acfb15940876fe471e)
- [meta] [plugin] set up plugin publishing [`2c52313`](https://github.com/ljharb/lockfile-tools/commit/2c52313bea1eba96df0feec7dabccfd4bbbfb7c6)
- [plugin] v1.0.0 [`0451508`](https://github.com/ljharb/lockfile-tools/commit/0451508da829dc77c2af6fd6e05d2c99cb2dfe29)
- [*] [deps] fix `lockfile-tools` dep [`02c9fcd`](https://github.com/ljharb/lockfile-tools/commit/02c9fcd32a7177194520fce4a5f33fdef3a5def2)
