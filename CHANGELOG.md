# Changelog

## [0.3.4] 12-01-2019

* Changed default value for setting `xliffSync.baseFile` to `.g.xlf` (GitHub issue [#34](https://github.com/rvanbekkum/vsc-xliff-sync/issues/34))

## [0.3.3] 16-11-2019

* Added notification that shows that an XLIFF Sync is in progress. This notification includes the name of the target file for which a sync is in progress.
* Added new setting `xliffSync.decorationEnabled` that can be used to disable decoration/highlight of missing translations and translations that need work in XLIFF files.

## [0.3.2] 03-11-2019

* Added the following new technical check (disabled by default):

  * `PlaceholdersDevNote` - Checks that the meaning of placeholders are explained in the Developer note.

* Added new setting `xliffSync.needWorkTranslationRulesEnableAll` to enable all available technical validation rules. If you want to use all rules including those that will be added in the future, you can use this setting. (**Default**: `false`)

* Fix: The XLIFF Sync note would only be removed for the first trans-unit where a problem is resolved. From now on, the XLIFF Sync note will be removed directly from all trans-units where the problems are detected to be resolved.

## [0.3.1] 20-10-2019

* Fix remove duplicate language tag entry `ja-JP` which shows up calling `XLIFF: Create New Target File(s)`.
* Changed `XLIFF: Create New Target File(s)` command adding two options **Select multiple..** (to select multiple target languages to create a file) and **Enter custom...** (to enter a custom target language tag).
* Added the following new technical checks (disabled by default):

  * `ConsecutiveSpacesConsistent` - Checks that the 'consecutive space'-occurrences match in source and translation.
  * `ConsecutiveSpacesExist` - Checks whether consecutive spaces exist in the source or translation text.

### Thank You

* **[fvet](https://github.com/fvet)** for requesting these new rules to be added. (GitHub issue [#25](https://github.com/rvanbekkum/vsc-xliff-sync/issues/25))
* **[pmoison](https://github.com/pmoison)** for reporting and explaining your issue which led to the changes to command `XLIFF: Create New Target File(s)`. (GitHub issue [#26](https://github.com/rvanbekkum/vsc-xliff-sync/issues/26))

## [0.3.0] 15-09-2019

* Added support for multi-root workspaces. You can configure settings per workspace folder. The commands of the extension will run for all workspace folders by default, but if you have a file opened in the editor from a workspace folder, then the commands will only run for the XLIFF files in that workspace folder.
* Added new command `XLIFF: Create New Target File(s)` which can be used to create new target files. If you run this command then you will get a list of language tags for the XLIFF file type that is used in the workspace folder. You can choose one or more language tags from this list, and the command will create new files for the selected languages accordingly.
* Small fix in the file-type quick pick list.
* When command `XLIFF: Synchronize to Single File` is run, the check for missing translations and problems will only be run for the single target file when `xliffSync.autoCheckMissingTranslations` and/or `xliffSync.autoCheckNeedWorkTranslations` are enabled. Also, these checks won't be run for newly created target files (as they won't have any translations).

## [0.2.6] 01-09-2019

* Added new setting `xliffSync.copyFromSourceForSameLanguage` that can be used to specify whether translations should be copied from the source text of trans-units in files for which source-language = target-language. (**Default**: `false`)
* Misc. updates in README (clarifications, typo-fixes)

## [0.2.5] 22-08-2019

* If a change in the source-text of a trans-unit is detected during synchronization, then the target-node/translation of the trans-unit in the target file will be tagged with `needs-adaptation`. Also an "XLIFF Sync" note will be added to the trans-unit to clarify that a change of the source text was detected.
* The count reported by the `XLIFF: Check for Need Work Translations` will now also include the trans-units that were already tagged with `needs-adaptation` (i.e., also including trans-units for which this command does not identify any problems, e.g., manually tagged trans-units).

### Thank You

* **[fvet](https://github.com/fvet)** for requesting target nodes to be tagged for review when the source text of the trans-unit changes.

## [0.2.4] 18-08-2019

* Added new command `XLIFF: Import Translations from File(s)` to import translations based on source and Developer note from external .xlf and .xlf2 files. You can select one more XLIFF files and translations will be merged into trans-units of XLIFF files in the project folder with matching target-language.
* Added new setting `xliffSync.replaceTranslationsDuringImport` (accompanying the above command) that can be used to specify whether the import of translations from external XLIFF files should replace/overwrite existing translations.
* Added new settings to further customize how trans-units and translations are synchronized:
  * `xliffSync.findByXliffGeneratorNoteAndSource`
  * `xliffSync.findBySourceAndDeveloperNote`
* Misc. updates in README (e.g., summary, badges)

## [0.2.3] 11-08-2019

* Added MIT copyright notices for all authors to sources
* Updated extension logo, adding outline (N.B., to also display nicely in VSCode's Light themes)

## [0.2.2] 10-08-2019

* Introduced new setting `xliffSync.needWorkTranslationRules` that can be used which checks need to be run by command `XLIFF: Check for Need Work Translations`.
* Added new rule `SourceEqualsTarget` which checks that the source and target are the same for files where source and target language are the same. (GitHub issue [#18](https://github.com/rvanbekkum/vsc-xliff-sync/issues/18))

## [0.2.1] 19-07-2019

* Fixed bug introduced by refactoring in 0.2.0: default shortcuts blocking clipboard. Also, made shortcuts the same for all operating systems.
* Fixed bug introduced by refactoring in 0.1.6: command `XLIFF: Synchronize to Single File` synchronizing to the wrong file.

## [0.2.0] 17-07-2019

* The `XLIFF: Check for Need Work Translations` command now checks for missing placeholders in both directions. (GitHub issue [#14](https://github.com/rvanbekkum/vsc-xliff-sync/issues/14))
* The "XLIFF Sync" notes added when problems are detected will now automatically be removed when problems are resolved if you run the `XLIFF: Check for Need Work Translations` command again. (GitHub issue [#12](https://github.com/rvanbekkum/vsc-xliff-sync/issues/12))
* New command `XLIFF: Next Needs Work Translation`: In an XLIFF file that is currently opened in the active editor, search for the next translation tagged as `needs-adaptation`. (GitHub issue [#13](https://github.com/rvanbekkum/vsc-xliff-sync/issues/13))
* The `XLIFF: Next Missing Translation` command will now check for `\<target/\>|\<target\>\</target\>|\<target state="needs-translation"/\>` if `xliffSync.missingTranslation` is set to `%EMPTY%`.
* Missing translations and translations that need work are now highlighted in the editor. You can change how these are highlighted by changing setting `xliffSync.decoration`. (N.B., if you don't want to have any highlighting, you can set this setting to `{}`)
* Trigger option checks for trans-units with `Property PromotedActionCategories` as well. (GitHub issue [#13](https://github.com/rvanbekkum/vsc-xliff-sync/issues/15))
* Fixed bug introduced by refactoring in 0.1.6, missing `await` for creating new target .xlf files. (GitHub issue [#16](https://github.com/rvanbekkum/vsc-xliff-sync/issues/16))
* Changed default shortcuts, see [README.md](https://github.com/rvanbekkum/vsc-xliff-sync/blob/master/README.md) for details.
* Updated [README.md](https://github.com/rvanbekkum/vsc-xliff-sync/blob/master/README.md) to describe new features and recent changes. Now also includes overview of the checks that are performed when running the `XLIFF: Check for Need Work Translations` command.

### Thank You

* **[fvet](https://github.com/fvet)** for testing the "Check for Need Work Translations" command and providing feedback.

## [0.1.6] 15-07-2019

* Added command and setting to check for translations that have problems and need work. The command `XLIFF: Check for Need Work Translations` will report about files that contain translations that need work and adds notes to describe the detected problem. You can also use setting `xliffSync.autoCheckNeedWorkTranslations` to automatically run the checks after syncing. (**Default**: `false`)

### Thank You

* **[fvet](https://github.com/fvet)** for requesting this feature in GitHub issue [#10](https://github.com/rvanbekkum/vsc-xliff-sync/issues/10).

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

* Added setting to synchronize translation units based on "source" (disabled by default). Please note that if there are multiple translation units in the target XLIFF file(s) with the same source, then the translation of the first translation unit is used for all new units.
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
