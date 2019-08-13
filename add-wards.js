#!/usr/bin/env node

const db = require('./lib/db');
const request = require('./lib/request');
const marClient = require('dc-mar').createClient({request});
const batchSize = 50;

main()
    .catch(console.error)
    .finally(() => db.close());

async function main() {
    while (true) {
        const rows = await db.getUnverifiedContributionAddresses(batchSize);
        if (!rows.length) {
            break;
        }
        const locations = await marClient.findLocationBatch(rows.map(r => r.address));
        let i = 0;
        for (const {id, address} of rows) {
            console.warn(id, address);
            let updateValues = {
                mar_confidence_level: 0,
                mar_address: null,
                mar_ward: null,
                mar_latitude: null,
                mar_longitude: null,
            };
            const location = locations[i][0];
            if (location) {
                updateValues = {
                    mar_confidence_level: location.confidenceLevel(),
                    mar_address: location.fullAddress(),
                    mar_ward: location.ward(),
                    mar_latitude: location.latitude(),
                    mar_longitude: location.longitude(),
                };
                console.warn(updateValues);
            }
            await db.updateContribution(id, updateValues);
            i++;
        }
    }
}
