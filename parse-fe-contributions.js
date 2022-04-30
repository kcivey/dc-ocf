#!/usr/bin/env node

const stringify = require('csv-stringify/lib/sync');
const parseFairElectionsPdf = require('./lib/parse-fair-elections-pdf');

main()
    .catch(function (err) {
        console.trace(err);
        process.exit(1);
    });

async function main() {
    const inputFile = process.argv[2];
    const {rowsBySchedule} = await parseFairElectionsPdf(inputFile);
    process.stdout.write(stringify(
        rowsBySchedule.A,
        {
            header: true,
            columns: [
                'contributor_first_name',
                'contributor_middle_name',
                'contributor_last_name',
                'number_and_street',
                'city',
                'state',
                'zip',
                'occupation',
                'employer_name',
                'employer_address',
                'contribution_type',
                'receipt_date',
                'amount',
            ],
        }
    ));
}
