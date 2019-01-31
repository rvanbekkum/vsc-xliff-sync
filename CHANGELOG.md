# Change Log

All notable changes to the "XLIFF Sync" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] 31-01-2019

* Allow empty string for setting "xliffSync.missingTranslation" when using placeholder `%EMPTY%`.
* When a new target file is generated, then if the base file ends with `g.xlf`, then strip the `.g` in the target file name (e.g., `<ExtensionName>.g.de-DE.xlf` -> `<ExtensionName>.de-DE.xlf`).

## [0.1.0] 31-01-2019 (Initial version)

* Forked version 0.2.1 of the [Angular Localization Helper](https://github.com/manux54/vsc-angular-localization-helper) extension as a starting point.
* Add support for syncing `trans-unit` nodes nested within groups (recursively).
* Add new command: **XLIFF: Synchronize All Files**