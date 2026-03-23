# Communauto Flex Find

A Node.js application that monitors Communauto Flex vehicle availability in real-time and alerts you when cars matching your criteria become available near your location.

## Description

Communauto Flex Find periodically checks the Communauto reservation API for available vehicles within a specified distance from your location. When cars matching your criteria are found, the application will alert you with a system sound.

## Getting Started

### Prerequisites

- Node.js (v16 or higher recommended)

### Running the Application

```bash
node communauto-flex-find.mjs [options]
```

## Options

| Option                | Short | Description                                                                     | Default    |
| --------------------- | ----- | ------------------------------------------------------------------------------- | ---------- |
| `--time <seconds>`    | `-t`  | Time interval between API requests                                              | `15`       |
| `--city <name>`       | `-c`  | City name: `montreal`, `quebec`, `toronto` (case-sensitive)                     | `montreal` |
| `--location <coord>`  | `-l`  | Location coordinates (format: "lat, lng")                                       | Required   |
| `--distance <meters>` | `-d`  | Search radius from location in meters                                           | `250`      |
| `--ignore <string>`   | `-i`  | Car models to ignore (comma-separated, optionally with distance filter using @) | None       |
| `--help`              | `-h`  | Display help message and exit                                                   | -          |

## Examples

Monitor for available cars in Montreal every 5 seconds within 250 meters of a specific location, ignoring certain car models:

```bash
node communauto-flex-find.mjs --time 5 --city montreal --location "45.496325399156305, -73.62030537200324" --distance 250 --ignore "K4, Corolla, Sentra, Elentra"
```

Search within 500 meters from a different location for all available cars ever 15 seconds:

```bash
node communauto-flex-find.mjs --time 15 --city montreal --location "45.501558588301286, -73.56580752510871" --distance 500
```

Display help:

```bash
node communauto-flex-find.mjs --help
```

## Ignore Filter Syntax

The `--ignore` option accepts comma-separated car model names. You can also specify an exact distance where a model should be ignored by using the `@` separator:

```bash
--ignore "Toyota Corolla, Kia Niro@200"
```

This would ignore all Toyota Corolla vehicles and any Kia Niro vehicles exactly 200 meters away (though multiple at this exact distance is unlikely). The distance filter allows you to ignore specific cars that you would otherwise be interested in taking, for example if it's an EV with low battery.

**Note:** Car model filtering is case-insensitive, so `"COROLLA"`, `"Corolla"`, and `"corolla"` are all equivalent.
