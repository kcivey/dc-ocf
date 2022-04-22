#!/usr/bin/env node

const stringify = require('csv-stringify/lib/sync');
const moment = require('moment');
const db = require('./lib/db');

main()
    .catch(function (err) {
        console.trace(err);
        process.exit(1);
    })
    .finally(() => db.close());

async function main() {
    const committeeName = '';
    const contributionLimit = await db.getContributionLimit(committeeName);
    const rows = await db.getExcessContributions(committeeName);
    const data = [];
    let prevRow = {};
    for (const row of rows) {
        const d = {
            'First Name': row.first_name,
            'Middle Name': row.middle_name,
            'Last Name': row.last_name,
            Address: row.address,
            City: row.city,
            State: row.state,
            Zip: row.zip,
            Date: moment(row.date).format('MM/DD/YYYY'),
            Amount: row.amount,
            Total: row.total,
        };
        if (row.normalized === prevRow.normalized) {
            d.Total = '';
            d.Excess = '';
        }
        else {
            d.Excess = (d.Total - contributionLimit).toFixed(2)
                .replace(/\.00$/, '');
        }
        prevRow = row;
        data.push(d);
    }
    process.stdout.write(stringify(data, {header: true}));
}
