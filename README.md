# XLIFF Sync

A VSCode extension to keep XLIFF translation files in sync with a specified, automatically generated base-XLIFF file.

This project originated from the need for a tool to automatically merge XLIFF translation files that are in the OASIS specification (instead of Angular's i18n).
More specifically, this extension is intended to ease merging new translations into XLIFF files from an `<ExtensionName>.g.xlf` file that is automatically generated by the [AL Language](https://github.com/Microsoft/AL) extension for Dynamics 365 Business Central extensions.

The intention is to keep this project simple with support for merging simple XLIFF files, i.e., only supporting the merge of `trans-unit` nodes that may or may not be contained in `group` nodes.
This extension is a fork of the [Angular Localization Helper extension](https://github.com/manux54/vsc-angular-localization-helper) by **[manux54](https://github.com/manux54)**!

## Features

* Merge new translations from a generated, base-XLIFF file into existing XLIFF files.
  - Merge from the base-XLIFF file into a manually specified target XLIFF file.
  - Merge from the base-XLIFF file into all XLIFF files in the open workspace.
* Search and highlight missing translations in an open XLIFF file.
* Support for XLIFF 1.2 and 2.0
* Convert between XLIFF 1.2 and 2.0 format.

## Contributions

### Commands

| Command | Explanation |
| ------- | ----------- |
| **XLIFF: Synchronize Single File** | Merge new trans-units from base-XLIFF file into a manually specified target XLIFF file. |
| **XLIFF: Synchronize All Files** | Merge new trans-units from base-XLIFF file into a all other XLIFF files in the open workspace folder. |
|**XLIFF: Next Missing Translation** | In an XLIFF that is currently opened in the active editor, search for the next missing translation. |

### Settings

| Setting | Default | Explanation |
| ------- | ------- | ----------- |
| xliffSync.baseFile | `translations.g.xlf` | Specifies which XLIFF file to use as the base (e.g., the generated XLIFF). If the file does not exist, you will be prompted to specify the file to use as base-XLIFF file the next you use the Synchronize command. |
| xliffSync.fileType | `xlf` | The file type (`xlf` or `xlf2`). |
| xliffSync.missingTranslation | `!MISSING_TRANSLATION!` | The placeholder for missing translations for trans-units that were synced/merged into target XLIFF files. You can use `%EMPTY%` if you want to use an empty string for missing translations. |
| xliffSync.findByMeaningAndDescription | `true` | Specifies whether or not the extension will try to find trans-units by meaning and description. |
| xliffSync.findByMeaning | `true` | Specifies whether or not the extension will try to find translation unit by meaning. |

## Usage

The extension will try to find corresponding translations units within an existing file for each units in the base file by searching units in the following order:

> 1.  By Id
> 2.  By Meaning & Source
> 3.  By Meaning & Description (optional)
> 4.  By Meaning (optional)

If no translation unit is found, the unit is added and tagged as missing.

### Synchronizing Single File

#### Using the Command Palette
> 1. F1 or Ctrl/Cmd + Shift + P to open the command palette
> 2. **XLIFF: Synchronize Single File**

#### Using keyboard shortcut

> 1.  Ctrl + Windows + S or Ctrl + Cmd + S (default shortcut)

By default, the extension expects the base-XLIFF file to be named `translations.g.xlf`. If no matching file is found, you are prompted to identify the base file. This setting will be saved for future use. If the extension is invoked from a localization file, that file will be updated, otherwise the extension will prompt you for the file to update. You can also create a new file.

### Synchronize All Files

#### Using the Command Palette

> 1. F1 or Ctrl/Cmd + Shift + P to open the command palette
> 2. **XLIFF: Synchronize All Files**

*NOTE*: This command will merge new translations into all XLIFF files in your workspace folder (with, obviously, excluding the base-XLIFF file itself).

### Find Missing Translations

#### Using the Command Palette

> 1.  F1 or CMD + Shift + P to open the command palette
> 2.  **XLIFF: Next Missing Translation**

#### Using keyboard shortcut

> 1.  Ctrl + Windows + N or Ctrl + Cmd + N (default shortcut)

Missing translations are tagged and highlighted. You can use the extension to navigate between missing translations.
On Macbook Pros the extension's commands appear on the touchbar within XLIFF files.

## Known Issues

* Automatically inserting new group nodes into target files may not work yet.