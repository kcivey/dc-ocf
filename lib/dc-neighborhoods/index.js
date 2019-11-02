const fs = require('fs');
const PolygonLookup = require('polygon-lookup');
const marClient = require('dc-mar').createClient();
const geoJsonFile = __dirname + '/dc-neighborhoods.geojson';
let lookup;

function setUp() {
    if (!lookup) {
        lookup = new PolygonLookup(
            JSON.parse(fs.readFileSync(geoJsonFile, 'utf8'))
        );
    }
    return lookup;
}

async function getNeighborhoodFeature(search) {
    setUp();
    let coords;
    if (Array.isArray(search)) {
        coords = search;
    }
    else if (search && typeof search === 'string') {
        const address = (await marClient.findLocation(search))[0];
        if (!address || address.confidenceLevel() < 95) {
            throw new Error(`Can't find address for "${search}"`);
        }
        coords = [address.longitude(), address.latitude()];
    }
    else {
        throw new Error('Argument must be an address string or a coordinate array');
    }
    return lookup.search(...coords);
}

async function getNeighborhoodName(search) {
    const feature = await getNeighborhoodFeature(search);
    return feature ? feature.properties.subhood : feature;
}

module.exports = {getNeighborhoodFeature, getNeighborhoodName};
