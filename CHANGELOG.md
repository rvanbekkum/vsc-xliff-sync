# Change Log

All notable changes to the "XLIFF Sync" extension will be documented in this file.

## [Unreleased]

N.A.

## [Prereleases]

## [0.1.5] 29-06-2019
* (Addressing GitHub issue [#9](https://github.com/rvanbekkum/vsc-xliff-sync/issues/9)): Added new settings which change the behaviour on how the extension deals with trans-unit node attributes from the source and target files:
  * `xliffSync.preserveTargetAttributes` : Specifies whether or not the extension should use the attributes from the target files for the trans-unit nodes while syncing. (**Default**: `false`)
  * `xliffSync.preserveTargetAttributesOrder` : Specifies whether the attributes of trans-unit nodes should use the order found in the target files while syncing. (**Default**: `false`)
* While syncing translations there is now a check for the "translate" attribute. If translate="no", then the trans-unit node in the target file(s) won't get a new empty target-node. (GitHub issue [#8](https://github.com/rvanbekkum/vsc-xliff-sync/issues/8))
* Also, while syncing, if a trans-unit node is found with translate="no" and it has a target-tag (a translation), then it will be deleted from the target file in question. (GitHub issue [#8](https://github.com/rvanbekkum/vsc-xliff-sync/issues/8))
* The `XLIFF: Check for Missing Translations` command now also checks for the translate attribute, and won't count trans-unit nodes with translate="no" as missing anymore. (GitHub issue [#8](https://github.com/rvanbekkum/vsc-xliff-sync/issues/8))
* Fixed bug where only the first occurrence of `\r\n` in elements were replaced with `\n`, leading to the issue that the string `&#xD;` would end up in multi-line translations while syncing when it shouldn't. (GitHub issue [#7](https://github.com/rvanbekkum/vsc-xliff-sync/issues/7))

## [0.1.4] 13-05-2019
* Changed default value of setting "xliffSync.missingTranslation" to `%EMPTY%`.
* Changed setting `xliffSync.findByMeaningAndDescription` to `xliffSync.findByXliffGeneratorAndDeveloperNote`, and `xliffSync.findByMeaning` to `xliffSync.findByXliffGeneratorNote`. Also introduced settings `xliffSync.developerNoteDesignation` and `xliffSync.xliffGeneratorNoteDesignation` that can be used to customize the designations for note tags that will be used to merge trans-units, if merging/syncing based on ID fails (GitHub issue [#6](https://github.com/rvanbekkum/vsc-xliff-sync/issues/6)).
* Fixed bug in merging translation files based on source tag (N.B., when `xliffSync.findBySource` is set to `true`) (GitHub issue [#3](https://github.com/rvanbekkum/vsc-xliff-sync/issues/3)).
* After running "XLIFF: Check for Missing Translations", show a message if no missing translations were found (GitHub issue [#5](https://github.com/rvanbekkum/vsc-xliff-sync/issues/5)).
* Added new setting `xliffSync.autoCheckMissingTranslations` that can be used to automatically check for missing translations after syncing (GitHub issue [#4](https://github.com/rvanbekkum/vsc-xliff-sync/issues/4)).

## [0.1.3] 14-04-2019
* Added setting to synchronize translation units based on "source" (disabled by default). Please note that if there are multiple translation units in the target XLIFF file(s) with the same source, then the translation of the first translation unit is used for all new units is used.
* Added new command "XLIFF: Check for Missing Translations" to the command palette. This command will show an informational message for each XLIFF file with missing translations. From these messages you can also open the XLIFF file(s) with your default XLIFF editor with the **Open Externally* button. (GitHub issue [#1](https://github.com/rvanbekkum/vsc-xliff-sync/issues/1))
* The command "XLIFF: Next Missing Translation" will now also jump to the next empty translation if setting `xliffSync.missingTranslation` is set to `%EMPTY%`.
* Updated the README file with screenshots and added setting/command.

## [0.1.2] 01-03-2019
* Updated project information (in package.json and README.md)
* Renamed commands
* Add option in the explorer context-menu for XLIFF files, which will do the following (GitHub issue [#2](https://github.com/rvanbekkum/vsc-xliff-sync/issues/2)):
  * In case the base-XLIFF file was selected, then the translation units of the base-XLIFF file will be synced to all other XLIFF files in the workspace.
  * In case any file other than the base-XLIFF file was selected, then only the selected file will be synced with the base-XLIFF file.

## [0.1.1] 31-01-2019

* Allow empty string for setting "xliffSync.missingTranslation" when using placeholder `%EMPTY%`.
* When a new target file is generated, then if the base file ends with `g.xlf`, then strip the `.g` in the target file name (e.g., `<ExtensionName>.g.de-DE.xlf` -> `<ExtensionName>.de-DE.xlf`).

## [0.1.0] 31-01-2019 (Initial version)

* Forked version 0.2.1 of the [Angular Localization Helper](https://github.com/manux54/vsc-angular-localization-helper) extension as a starting point.
* Add support for syncing `trans-unit` nodes nested within groups (recursively).
* Add new command: **XLIFF: Synchronize All Files**