import { parseArgs } from "util";
import { execSync } from "child_process";

const branchIds = {
  montreal: 1,
  quebec: 2,
  toronto: 3,
};

/**
 * Parses command line arguments and returns the values.
 *
 * @returns {object} Parsed argument values
 */
function parseArguments() {
  const { values } = parseArgs({
    options: {
      city: {
        type: "string",
        short: "c",
        default: "montreal",
      },
      time: {
        type: "string",
        short: "t",
        default: "15",
      },
      location: {
        type: "string",
        short: "l",
      },
      distance: {
        type: "string",
        short: "d",
        default: "250",
      },
      search: {
        type: "string",
        short: "s",
        default: "",
      },
      ignore: {
        type: "string",
        short: "i",
        default: "",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
  });
  return values;
}

/**
 * Displays the help message and exits the program.
 */
function displayHelp() {
  console.log(`
Usage: node communauto-flex-find.mjs [options]

Options:
  -c, --city <name>       City name (default: montreal). Supported cities: ${Object.keys(
    branchIds,
  ).join(", ")}
  -t, --time <seconds>    Time interval check between requests (default: 15)
  -l, --location <coord>  Location coordinates (example: "45.52009, -73.55571")
  -d, --distance <meters> Distance radius from location to check (default: 250)
  -s, --search <string>   String containing car models to be exclusively searched within the radius (example: "Kona, Niro")
  -i, --ignore <string>   String containing car models, plates and/or models@distance to be ignored (example: "Corolla, FSH4167, Niro@200")
  -h, --help              Show this help message

Examples:
  node communauto-flex-find.mjs --time 10 --city montreal --location "45.50156, -73.56581" --distance 500 --search "Kona"
  node communauto-flex-find.mjs --time 5 --city montreal --location "45.49633, -73.62031" --distance 250 --ignore "Corolla, Sentra, Elantra, K4"
  node communauto-flex-find.mjs --help
`);
  process.exit();
}

/**
 * Parses a comma-separated list of car model filters.
 *
 * @param {string} listStr - Comma-separated string of models or ignore terms
 * @param {object} [options] - Parsing options
 * @param {boolean} [options.allowExactDistance=false] - Allow exact-distance suffix parsing
 * @returns {Array<string>|Array<{term: string, exactDistance?: number, plate?: string}>}
 */
function parseModelList(listStr, { allowExactDistance = false } = {}) {
  if (!listStr) {
    return [];
  }

  return listStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      if (!allowExactDistance) {
        return item.toLowerCase();
      }

      if (item.includes("@")) {
        const [term, dist] = item.split("@").map((x) => x.trim());
        return {
          term: term.toLowerCase(),
          exactDistance: dist ? parseInt(dist) : undefined,
        };
      }

      if (/^(?=.*[a-z])(?=.*\d)[a-z\d]{6,7}$/i.test(item)) {
        return { plate: item.toLowerCase() };
      }

      return { term: item.toLowerCase() };
    });
}

/**
 * Validates the city and returns the branch ID.
 *
 * @param {string} city - City name
 * @returns {number} Branch ID
 * @throws {Error} If city is not supported
 */
function getBranchId(city) {
  if (city && !branchIds[city]) {
    throw new Error(`City ${city} not supported.`);
  }

  return city ? branchIds[city] : 1;
}

/**
 * Parses the location string into an array of floats.
 *
 * @param {string} locationStr - Comma-separated coordinates
 * @returns {number[]} Array of [lat, lng]
 */
function parseLocation(locationStr) {
  return locationStr.split(",").map((c) => parseFloat(c.trim()));
}

/**
 * Fetches available vehicles from the API.
 *
 * @param {number[]} location - [lat, lng]
 * @param {number} branchId - Branch ID
 * @returns {Promise<Array>} Array of vehicle objects
 */
async function getCars(location, branchId) {
  const url = `https://www.reservauto.net/WCF/LSI/LSIBookingServiceV3.svc/GetAvailableVehicles?BranchID=${branchId}&LanguageID=2`;
  const result = await retry(async () => await fetch(url));
  const json = await result.json();

  return json.d.Vehicles.map((vehicle) => ({
    brand: vehicle.CarBrand,
    model: vehicle.CarModel,
    plate: vehicle.CarPlate,
    color: vehicle.CarColor,
    lat: vehicle.Latitude,
    lng: vehicle.Longitude,
    distance: calculateDistance(
      ...location,
      vehicle.Latitude,
      vehicle.Longitude,
    ),
  }));
}

/**
 * Filters cars based on distance and ignore list.
 * Model matching is bidirectional: ignores if the car model contains the ignored string or vice versa.
 *
 * @param {Array} cars - Array of car objects
 * @param {number} distanceRadius - Max distance in meters
 * @param {Array} ignoredCars - Array of ignore objects
 * @returns {Array} Filtered and sorted array of cars
 */
function filterCars(cars, distanceRadius, ignoredCars) {
  return cars
    .filter(
      (car) =>
        car.distance <= distanceRadius &&
        !ignoredCars.some((ignored) => {
          const carModel = car.model.toLowerCase();
          const carPlate = car.plate.toLowerCase();
          const ignoredTerm = ignored.term;
          const ignoredPlate = ignored.plate;

          const modelMatches =
            ignoredTerm &&
            (carModel.includes(ignoredTerm) || ignoredTerm.includes(carModel));
          const plateMatches =
            ignoredPlate &&
            (carPlate.includes(ignoredPlate) ||
              ignoredPlate.includes(carPlate));
          const distanceMatches =
            ignored.exactDistance === undefined ||
            Math.floor(car.distance) === ignored.exactDistance;

          if (ignoredPlate) {
            return plateMatches && (!ignoredTerm || modelMatches);
          }

          return modelMatches && distanceMatches;
        }),
    )
    .sort((a, b) => a.distance - b.distance);
}

/**
 * Parses the search string into an array of lowercased model names.
 *
 * @param {string} searchStr - Comma-separated string of models to search for
 * @returns {Array<string>} Array of lowercased search terms
 */
function parseSearchedCars(searchStr) {
  return parseModelList(searchStr);
}

/**
 * Parses the ignore string into an array of ignore rules.
 *
 * @param {string} ignoreStr - Comma-separated string of car models, plates and/or models@distance
 * @returns {Array<{term: string, exactDistance?: number}>} Array of ignore objects
 */
function parseIgnoredCars(ignoreStr) {
  return parseModelList(ignoreStr, { allowExactDistance: true });
}

/**
 * Filters cars by search criteria and ignores.
 *
 * @param {Array} cars - Array of car objects
 * @param {number} distanceRadius - Max search radius in meters
 * @param {Array<string>} searchedCars - Lowercased model terms to search for
 * @param {Array<{model: string, exactDistance?: number}>} [ignoredCars=[]] - Ignore list entries
 * @returns {Array} Filtered and sorted array of cars that match the search criteria
 */
function searchCars(cars, distanceRadius, searchedCars, ignoredCars = []) {
  if (!searchedCars || searchedCars.length === 0) {
    return [];
  }

  return cars
    .filter((car) => {
      if (car.distance > distanceRadius) {
        return false;
      }

      const carModel = car.model.toLowerCase();
      const carPlate = car.plate.toLowerCase();
      const isIgnored = ignoredCars.some((ignored) => {
        const ignoredTerm = ignored.term;
        const ignoredPlate = ignored.plate;

        const modelMatches =
          ignoredTerm &&
          (carModel.includes(ignoredTerm) || ignoredTerm.includes(carModel));
        const plateMatches =
          ignoredPlate &&
          (carPlate.includes(ignoredPlate) || ignoredPlate.includes(carPlate));
        const distanceMatches =
          ignored.exactDistance === undefined ||
          Math.floor(car.distance) === ignored.exactDistance;

        if (ignoredPlate) {
          return plateMatches && (!ignoredTerm || modelMatches);
        }

        return modelMatches && distanceMatches;
      });

      if (isIgnored) {
        return false;
      }

      return searchedCars.some((searchModel) => {
        return carModel.includes(searchModel) || searchModel.includes(carModel);
      });
    })
    .sort((a, b) => a.distance - b.distance);
}

/**
 * Plays the alert sound.
 * Tries to play a Windows system sound with PowerShell. If that fails,
 * falls back to writing a system beep character to stdout.
 */
function playAlert() {
  try {
    execSync(
      "powershell.exe -c \"$player = New-Object Media.SoundPlayer 'C:\\\\Windows\\\\Media\\\\Windows Hardware Fail.wav'; $player.PlaySync(); $player.PlaySync(); $player.PlaySync();\"",
    );
  } catch (e) {
    process.stdout.write("\u0007");
  }
}

/**
 * Main function that runs the car monitoring loop.
 */
async function main() {
  const values = parseArguments();

  if (values.help) {
    displayHelp();
  }

  const pause = parseInt(values.time); // Seconds
  const distanceRadius = parseInt(values.distance); // Meters
  const ignoredCars = parseIgnoredCars(values.ignore);
  const searchedCars = parseSearchedCars(values.search);
  const branchId = getBranchId(values.city);

  console.log(
    "Using city branch: %s. Branch ID: %i",
    Object.keys(branchIds).find((k) => branchIds[k] === branchId),
    branchId,
  );

  const location = parseLocation(values.location);

  console.log("Current location: %s, %s", ...location);

  while (true) {
    const cars = await getCars(location, branchId);
    const searchedResults = searchCars(
      cars,
      distanceRadius,
      searchedCars,
      ignoredCars,
    );
    const filteredCars = filterCars(cars, distanceRadius, ignoredCars);
    const carsWithinRadius = cars.filter(
      (car) => car.distance <= distanceRadius,
    );

    console.log(
      "%i cars found. %i within %s. Waiting %i seconds",
      cars.length,
      carsWithinRadius.length,
      humanDistance(distanceRadius),
      pause,
    );

    if (searchedCars.length) {
      if (searchedResults.length) {
        searchedResults.forEach((car) =>
          console.log(
            `\x1b[33m[${car.plate}] ${car.brand} ${car.model}, ${car.color}, is ${Math.floor(car.distance)}m away at {${car.lat}, ${car.lng}}\x1b[0m`,
          ),
        );

        playAlert();
        process.exit(0);
      }

      console.log(
        "No searched cars matched after filters; waiting %i seconds",
        pause,
      );

      await wait(pause * 1000);
      continue;
    }

    if (filteredCars.length) {
      filteredCars.forEach((car) =>
        console.log(
          `\x1b[33m[${car.plate}] ${car.brand} ${car.model}, ${car.color}, is ${Math.floor(car.distance)}m away\x1b[0m`,
        ),
      );

      playAlert();
      process.exit(0);
    }

    await wait(pause * 1000);
  }
}

// Utility functions

/**
 * Calculates the distance between two points using the Haversine formula.
 * @param {number} lat1 - Latitude 1
 * @param {number} lng1 - Longitude 1
 * @param {number} lat2 - Latitude 2
 * @param {number} lng2 - Longitude 2
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const earthRadius = 6371; // In km
  const distance = earthRadius * c;

  return distance * 1000;
}

/**
 * Converts degrees to radians.
 * @param {number} degrees - Degrees
 * @returns {number} Radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Returns a human-readable distance string.
 * @param {number} inp - Distance in meters
 * @returns {string} Formatted distance
 */
function humanDistance(inp) {
  if (inp < 1000) return inp + "m";
  return (inp / 1000).toFixed(1) + "km";
}

/**
 * Waits for a specified number of milliseconds.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after the delay
 */
function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Retries a function call with exponential backoff.
 * @param {Function} cb - Function to retry
 * @param {number} times - Number of retries (default: 3)
 * @param {number} time - Initial delay in ms (default: 1000)
 * @returns {Promise} Result of the function call
 */
async function retry(cb, times = 3, time = 1000) {
  try {
    return await cb();
  } catch (err) {
    if (times === 0) {
      throw err;
    } else {
      console.warn(
        "Function failed with error %s. Trying again in %s seconds",
        err,
        time / 1000,
      );
      await wait(time);
      return retry(cb, times - 1, time);
    }
  }
}

// Run the main function
main().catch(console.error);
