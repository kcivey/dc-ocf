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
        const rows = await db.getWardlessContributionAddresses(batchSize);
        if (!rows.length) {
            break;
        }
        const locations = await marClient.findLocationBatch(rows.map(r => r.address));
        let i = 0;
        for (const {id, address} of rows) {
            console.warn(id, address);
            const location = locations[i][0];
            if (location) {
                console.warn(location.fullAddress(), location.ward(), location.confidenceLevel());
            }
            const [marAddress, ward] = location && location.confidenceLevel() >= 90 ?
                [location.fullAddress(), location.ward()] : ['', ''];
            if (location && location.confidenceLevel() < 100) {
                console.warn(locations[i].map(l => [l.confidenceLevel(), l.fullAddress()]))
            }
            await db.updateContribution(id, {mar_address: marAddress, ward});
            i++;
        }
    }
}
