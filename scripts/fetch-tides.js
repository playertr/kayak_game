const fs = require("fs");
const path = require("path");

const stations = [
  "9446484",  // Tacoma
  "9447130",  // Seattle
  "9444900",  // Port Townsend
  "9443090",  // Neah Bay (tip of Olympic Peninsula)
  "9441102",  // Westport (outer WA coast)
  "9439040",  // Astoria (Columbia River mouth)
  "9449880",  // Friday Harbor (San Juan Islands)
  "9449424",  // Cherry Point (near Bellingham)
];
const base = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

async function main() {
  const result = {};
  for (const id of stations) {
    const url = `${base}?begin_date=20260529&end_date=20260601&station=${id}&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&interval=h&format=json&application=Seventy48Game`;
    console.log(`Fetching station ${id}...`);
    const res = await fetch(url);
    const json = await res.json();
    result[id] = json;
    console.log(`  Got ${json.predictions ? json.predictions.length : 0} predictions`);
    if (json.predictions) {
      console.log(`  First 3:`, JSON.stringify(json.predictions.slice(0, 3), null, 2));
    } else {
      console.log(`  Response:`, JSON.stringify(json).slice(0, 200));
    }
  }
  const outPath = path.resolve(__dirname, '..', 'data', 'noaa-tide-data.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nSaved ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
