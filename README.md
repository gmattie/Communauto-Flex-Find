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
| `--city <name>`       | `-c`  | City name: `montreal`, `quebec`, `toronto` (case-sensitive)                     | `montreal` |
| `--time <seconds>`    | `-t`  | Time interval between API requests                                              | `15`       |
| `--location <coord>`  | `-l`  | Location coordinates (format: "lat, lng")                                       | Required   |
| `--distance <meters>` | `-d`  | Search radius from location in meters                                           | `250`      |
| `--search <string>`   | `-s`  | Car models to search for within the radius (comma-separated)                    | None       |
| `--ignore <string>`   | `-i`  | Car models to ignore (comma-separated, optionally with distance filter using @) | None       |
| `--help`              | `-h`  | Display help message and exit                                                   | -          |

## Examples

Find all available cars in Montreal within 500 meters of a specified location:

```bash
node communauto-flex-find.mjs --city montreal --location "45.52260, -73.59184" --distance 500
```

Monitor for available cars in Montreal every 10 seconds within 250 meters of a specific location, ignoring certain car models:

```bash
node communauto-flex-find.mjs --city montreal --time 10 --location "45.52058, -73.55423" --distance 250 --ignore "Corolla, Sentra, Elantra, K4"
```

Search for specific car models in Montreal every 30 seconds within 100 meters of a specific location:

```bash
node communauto-flex-find.mjs --city montreal --time 30 --location "45.53237, -73.48881" --distance 100 --search "Kona, Niro"
```

Display help:

```bash
node communauto-flex-find.mjs --help
```

## Ignore Filter Syntax

The ignore filter allows you to exclude entire model lines or specific cars from models you would otherwise be interested in taking, such as when it's an EV with a low battery. The `--ignore` option accepts comma-separated car models, plates and/or models@distance. For example:

```bash
--ignore "Corolla, FSH4167, Niro@200"
```

This would ignore all Toyota Corolla vehicles, ignore the car with the plate `FSH4167` and ignore any Kia Niro vehicles exactly 200 meters away (though multiple at this exact distance is unlikely).

You can also use `--search` and `--ignore` together. For example, to search only for `Kona` but ignore the Kona currently 325 meters away:

```bash
node communauto-flex-find.mjs --city montreal --location "45.52272, -73.59192" --distance 500 --search "Kona" --ignore "Kona@325"
```

**Note:** Car model filtering is case-insensitive, so `"COROLLA"`, `"Corolla"`, and `"corolla"` are all equivalent.
