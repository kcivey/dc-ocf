#!/usr/bin/env node

const {sprintf} = require('sprintf-js');
const moment = require('moment');
const db = require('./lib/db');

main()
    .catch(function (err) {
        console.trace(err);
        process.exit(1);
    })
    .finally(() => db.close());

async function main() {
    const pattern = process.argv[2] + '%';
    const rows = await db.select(
        'receipt_date',
        'amount',
        'normalized',
        'candidate_name',
        'office',
        'election_year'
    )
        .from(`${db.contributionTableName} AS con`)
        .join(`${db.committeeTableName} as com`, 'con.committee_name', 'com.committee_name')
        .where('normalized', 'LIKE', pattern)
        .orderBy('receipt_date', 'candidate_name');
    const counts = {};
    for (const r of rows) {
        console.log(sprintf(
            '%8s %5s %-20.20s %-16.16s %4s',
            moment(r.receipt_date).format('MM/DD/YY'),
            '$' + Math.round(r.amount),
            r.candidate_name,
            r.office,
            r.election_year,
        ));
        if (!counts[r.normalized]) {
            counts[r.normalized] = 0;
        }
        counts[r.normalized]++;
    }
    console.log('');
    for (const [donor, count] of Object.entries(counts)) {
        console.log(count, donor);
    }
}
