# Change Log

All notable changes to the "XLIFF Sync" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.4]
* Changed default value of setting "xliffSync.missingTranslation" to `%EMPTY%`.
* Changed setting `xliffSync.findByMeaningAndDescription` to `xliffSync.findByXliffGeneratorAndDeveloperNote`, and `xliffSync.findByMeaning` to `xliffSync.findByXliffGeneratorNote`. Also introduced settings `xliffSync.developerNoteDesignation` and `xliffSync.xliffGeneratorNoteDesignation` that can be used to customize the designations for note tags that will be used to merge trans-units, if merging/syncing based on ID fails.

## [Prereleases]

## [0.1.3] 14-04-2019
* Added setting to synchronize translation units based on "source" (disabled by default). Please note that if there are multiple translation units in the target XLIFF file(s) with the same source, then the translation of the first translation unit is used for all new units is used.
* Added new command "XLIFF: Check for Missing Translations" to the command palette. This command will show an informational message for each XLIFF file with missing translations. From these messages you can also open the XLIFF file(s) with your default XLIFF editor with the **Open Externally* button.
* The command "XLIFF: Next Missing Translation" will now also jump to the next empty translation if setting `xliffSync.missingTranslation` is set to `%EMPTY%`.
* Updated the README file with screenshots and added setting/command.

## [0.1.2] 01-03-2019
* Updated project information (in package.json and README.md)
* Renamed commands
* Add option in the explorer context-menu for XLIFF files, which will do the following:
  * In case the base-XLIFF file was selected, then the translation units of the base-XLIFF file will be synced to all other XLIFF files in the workspace.
  * In case any file other than the base-XLIFF file was selected, then only the selected file will be synced with the base-XLIFF file.

## [0.1.1] 31-01-2019

* Allow empty string for setting "xliffSync.missingTranslation" when using placeholder `%EMPTY%`.
* When a new target file is generated, then if the base file ends with `g.xlf`, then strip the `.g` in the target file name (e.g., `<ExtensionName>.g.de-DE.xlf` -> `<ExtensionName>.de-DE.xlf`).

## [0.1.0] 31-01-2019 (Initial version)

* Forked version 0.2.1 of the [Angular Localization Helper](https://github.com/manux54/vsc-angular-localization-helper) extension as a starting point.
* Add support for syncing `trans-unit` nodes nested within groups (recursively).
* Add new command: **XLIFF: Synchronize All Files**