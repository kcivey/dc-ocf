#!/usr/bin/env node

const argv = require('yargs')
    .options({
        year: {
            type: 'number',
            describe: 'election year',
            default: 0,
            defaultDescription: 'all available',
            requiredArg: true,
        },
    })
    .strict(true)
    .argv;
const db = require('./lib/db');
const request = require('./lib/request');
const marClient = require('dc-mar').createClient({request});
const batchSize = 40;

main()
    .catch(function (err) {
        console.trace(err);
        process.exit(1);
    })
    .finally(() => db.close());

async function main() {
    while (true) {
        const addresses = await db.getUnverifiedContributionAddresses(batchSize, argv.year);
        if (!addresses.length) {
            break;
        }
        const locations = await marClient.findLocationBatch(addresses);
        const newRecords = [];
        let i = 0;
        for (const address of addresses) {
            const record = {
                ocf_address: address,
                confidence_level: 0,
            };
            const location = locations[i][0];
            if (location) {
                Object.assign(record, {
                    confidence_level: location.confidenceLevel(),
                    address: location.fullAddress(),
                    ward: location.ward(),
                    latitude: location.latitude(),
                    longitude: location.longitude(),
                });
            }
            console.warn(record);
            newRecords.push(record);
            i++;
        }
        await db.batchInsert(db.marTableName, newRecords);
    }
}
