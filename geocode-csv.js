#!/usr/bin/env node

const fs = require('fs');
const csvParse = require('csv-parse');
const csvStringify = require('csv-stringify/lib/sync');
const request = require('./lib/request');
const marClient = require('dc-mar').createClient({request});
const batchSize = 40;
const stateField = 'Donor State';
const addressField = 'Donor Address Line 1';
const inputFile = process.argv[2];
const outputFile = inputFile.replace(/(?=\.csv$)/i, '-with-wards');

main()
    .catch(function (err) {
        console.trace(err);
        process.exit(1);
    });

function main() {
    return new Promise(function (resolve, reject) {
        const parser = csvParse({columns: true});
        const input = fs.createReadStream(inputFile);
        const newRecords = [];
        let batch = [];
        parser.on('readable', async function () {
            let record;
            while ((record = parser.read())) {
                batch.push(record);
                if (batch.length >= batchSize) {
                    await geocode();
                }
            }
            return undefined;
        });
        parser.on('error', reject);
        parser.on('end', async function () {
            if (batch.length) {
                await geocode();
            }
            fs.writeFileSync(outputFile, csvStringify(newRecords, {header: true}));
            return resolve();
        });
        input.pipe(parser);

        async function geocode() {
            const addresses = batch.filter(r => r[stateField] === 'DC').map(r => r[addressField]);
            console.warn(`Looking up ${addresses.length} DC records from ${batch.length} records`);
            if (addresses.length) {
                const locations = await marClient.findLocationBatch(addresses);
                let locationIndex = 0;
                for (const record of batch) {
                    const location = record[stateField] === 'DC' && locations[locationIndex] &&
                        locations[locationIndex][0];
                    newRecords.push({
                        ...record,
                        mar_confidence: location ? location.confidenceLevel() : 0,
                        mar_address: location ? location.fullAddress() : '',
                        ward: location ? location.ward() : '',
                        smd: location ? location.smd() : '',
                        precinct: location ? location.precinct() : '',
                        latitude: location ? location.latitude() : '',
                        longitude: location ? location.longitude() : '',
                    });
                    if (record[stateField] === 'DC') {
                        locationIndex++;
                    }
                }
            }
            batch = []; // eslint-disable-line require-atomic-updates
        }
    });
}
